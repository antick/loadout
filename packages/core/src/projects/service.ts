import { basename, dirname, join } from "node:path";
import type { Project, ProjectTarget, ProjectsApi, SkillDocument } from "@skillboard/shared";
import type { CoreContext } from "../context";
import { exists, invalid, isAppError, notFound } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import {
  canonicalPath,
  ensureDir,
  isDirectory,
  normalizeAbsolutePath,
  pathsOverlap,
} from "../util/fs";
import { slugify } from "../util/names";
import { readLocalDocument } from "../workspace/local-actions";
import { type LibraryIndex, indexLibrary } from "../workspace/local-scan";
import { type ProjectActionsDeps, createProjectActions } from "./actions";
import { findProjects, listProjectSkills, summarize } from "./scan";
import { type ProjectRecord, ProjectStore } from "./store";
import {
  DISABLED_SUFFIX,
  type ResolvedTarget,
  defaultProjectSkillsDir,
  findTarget,
  isAvailable,
  projectSkillDirs,
  resolveTargets,
} from "./targets";

export type ProjectsServiceDeps = ProjectActionsDeps;

export interface ProjectsService {
  api: ProjectsApi;
  projects: ProjectStore;
}

function toTarget(target: ResolvedTarget): ProjectTarget {
  const {
    enabledRoot: _enabled,
    disabledRoot: _disabled,
    ownsDisabledRoot: _owns,
    ...rest
  } = target;
  return rest;
}

function requireFolder(input: string, label: string): string {
  const path = normalizeAbsolutePath(input, label);
  if (!isDirectory(path)) throw notFound(`${label} is not an existing folder: ${path}`);
  return path;
}

/** Project workspaces (a repository with per-agent skills folders) and linked skills roots. */
export function createProjectsService(
  ctx: CoreContext,
  deps: ProjectsServiceDeps,
): ProjectsService {
  const { store, registry } = deps;
  const projects = new ProjectStore(ctx.db);
  const actions = createProjectActions(ctx, deps);

  const library = (): LibraryIndex => indexLibrary(store.list(), store.deployments());
  const targetsOf = (project: ProjectRecord): ResolvedTarget[] => resolveTargets(project, registry);

  /** The same folder must not be saved twice, even when reached through a link. */
  function refuseDuplicate(path: string): void {
    const real = canonicalPath(path);
    const taken = projects
      .list()
      .some((project) => project.path === path || canonicalPath(project.path) === real);
    if (taken) throw exists(`This folder is already a workspace: ${path}`);
  }

  function describe(record: ProjectRecord, index: LibraryIndex = library()): Project {
    const missing = !isDirectory(record.path);
    const targets = targetsOf(record);
    const skills = missing ? [] : listProjectSkills(targets, index);
    return {
      id: record.id,
      name: record.name,
      path: record.path,
      type: record.type,
      supportsToggle: targets.some((target) => target.disabledRoot !== null),
      sortOrder: record.sortOrder,
      ...summarize(skills),
      missing,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** A given folder must exist; otherwise a sibling is made, and failing that there is none. */
  function resolveDisabledRoot(
    skillsRoot: string,
    given: string | null | undefined,
  ): string | null {
    if (given?.trim()) return requireFolder(given, "Disabled skills path");
    const sibling = join(dirname(skillsRoot), `${basename(skillsRoot)}${DISABLED_SUFFIX}`);
    try {
      ensureDir(sibling);
      return sibling;
    } catch (error) {
      ctx.log.warn(
        `Could not create ${sibling}; skills in this workspace cannot be disabled`,
        error,
      );
      return null;
    }
  }

  const api: ProjectsApi = {
    list: async () => {
      // One look at the library serves every workspace in the list.
      const index = library();
      return projects.list().map((record) => describe(record, index));
    },

    add: async (path) => {
      const root = requireFolder(path, "Project path");
      refuseDuplicate(root);
      // Every project starts with the default agent's folders, so there is somewhere to export to.
      const skillsDir = defaultProjectSkillsDir(registry);
      if (skillsDir) {
        ensureDir(join(root, skillsDir));
        ensureDir(join(root, `${skillsDir}${DISABLED_SUFFIX}`));
      }
      const record = projects.insert({
        name: basename(root),
        path: root,
        type: "project",
        linkedAgentKey: null,
        disabledPath: null,
      });
      ctx.touched("projects");
      return describe(record);
    },

    addLinked: async (name, path, disabledPath) => {
      const label = name.trim();
      if (!label) throw invalid("Workspace name is required");
      const root = requireFolder(path, "Skills path");
      refuseDuplicate(root);
      const disabledRoot = resolveDisabledRoot(root, disabledPath);
      if (disabledRoot && pathsOverlap(canonicalPath(root), canonicalPath(disabledRoot))) {
        throw invalid("The skills folder and the disabled skills folder must not overlap");
      }
      const record = projects.insert({
        name: label,
        path: root,
        type: "linked",
        linkedAgentKey: slugify(label),
        disabledPath: disabledRoot,
      });
      ctx.touched("projects");
      return describe(record);
    },

    remove: async (id) => {
      projects.get(id);
      projects.delete(id);
      ctx.settings.deleteRaw(INTERNAL_KEYS.projectExportAgents(id));
      ctx.touched("projects");
    },

    reorder: async (ids) => {
      projects.reorder(ids);
      ctx.touched("projects");
    },

    scan: async (root) => findProjects(requireFolder(root, "Folder"), projectSkillDirs(registry)),

    targets: async (id) => targetsOf(projects.get(id)).map(toTarget),

    skills: async (id) => listProjectSkills(targetsOf(projects.get(id)), library()),

    document: async (id, relativePath, agentKey): Promise<SkillDocument> => {
      const target = findTarget(targetsOf(projects.get(id)), agentKey);
      if (!target) throw notFound(`Unknown agent for this workspace: ${agentKey}`);
      try {
        return readLocalDocument(target.enabledRoot, relativePath);
      } catch (error) {
        // Not among the switched-on skills: it may be parked on the disabled side.
        if (!isAppError(error, "NOT_FOUND") || !target.disabledRoot) throw error;
        return readLocalDocument(target.disabledRoot, relativePath);
      }
    },

    exportSkill: async (skillId, id, agentKeys) =>
      actions.exportSkill(store.get(skillId), projects.get(id), agentKeys),

    pushToLibrary: async (id, relativePath) =>
      actions.pushToLibrary(projects.get(id), relativePath),

    pullFromLibrary: async (id, relativePath) =>
      actions.pullFromLibrary(projects.get(id), relativePath),

    setSkillEnabled: async (id, relativePath, enabled) =>
      actions.setSkillEnabled(projects.get(id), relativePath, enabled),

    deleteSkill: async (id, relativePath, agentKey) =>
      actions.deleteSkill(projects.get(id), relativePath, agentKey),

    lastExportAgents: async (id) => {
      const targets = targetsOf(projects.get(id));
      return ctx.settings
        .getRaw<string[]>(INTERNAL_KEYS.projectExportAgents(id), [])
        .filter((key) => {
          const target = findTarget(targets, key);
          return target !== null && isAvailable(target);
        });
    },

    setLastExportAgents: async (id, agentKeys) => {
      projects.get(id);
      ctx.settings.setRaw(INTERNAL_KEYS.projectExportAgents(id), [...new Set(agentKeys)]);
    },

    reveal: async (id) => ctx.host.revealPath(projects.get(id).path),
  };

  return { api, projects };
}
