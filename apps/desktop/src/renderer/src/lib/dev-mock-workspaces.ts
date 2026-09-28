/**
 * DEV ONLY. Agent-folder (`workspace.*`) and project (`projects.*`) handlers for the in-memory
 * preview bridge in `dev-mock.ts`, so the agent and project pages can be tried in a plain browser.
 * Seeds cover every sync status, unmanaged folders, a nested folder, a switched-off skill and a
 * skill whose two copies disagree (pushing it reports conflicting variants), and folders an agent
 * skips: one without a SKILL.md, an empty one, a dead link and a managed copy that lost its file.
 */
import type {
  AgentInfo,
  BrokenSkillFolder,
  ErrorCode,
  LocalSkill,
  Project,
  ProjectTarget,
  PushToLibraryOptions,
  PushToLibraryResult,
  Skill,
  SkillDocument,
  SyncStatus,
} from "@loadout/shared";
import { HOME } from "@/lib/dev-mock-data";
import { mockDuplicates, mockPluginSkills } from "@/lib/dev-mock-duplicates";
import { recordRemoved } from "@/lib/dev-mock-storage";
import {
  type Copy,
  copy,
  dirNameOf,
  documentFor,
  mockImportedSkill,
  mockProject,
  projectTargets,
  sameSkill,
  seedBroken,
  seedDeployedStatus,
  seedLastExportAgents,
  seedProjectCopies,
  seedUnmanaged,
} from "@/lib/dev-mock-workspace-seed";

export interface WorkspaceMockContext {
  getSkills(): Skill[];
  setSkills(next: Skill[]): void;
  getAgents(): AgentInfo[];
  getProjects(): Project[];
  setProjects(next: Project[]): void;
  /** Deploy or remove one pair; false when it was already in the wanted state. */
  setDeployed(skillId: string, agentKey: string, on: boolean): boolean;
  emitChanged(...scope: ("skills" | "projects")[]): void;
  fail(code: ErrorCode, message: string): never;
}

const STEP_MS = 350;
/** Managed skills of this agent are shown as copies; the others as links into the library. */
const COPY_AGENT_KEY = "codex";
const SKILL_FILES = ["SKILL.md", "scripts", "reference.md"];
const SCAN_RESULTS = ["shop-web", "billing-api", "docs-site", "mobile/app", "tools/release-bot"];
const DISABLED_SUFFIX = "-disabled";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export function createWorkspaceMockHandlers(
  ctx: WorkspaceMockContext,
): Record<string, (...args: never[]) => unknown> {
  const deployedStatus = seedDeployedStatus();
  // Folders the app did not put there.
  let unmanaged: Copy[] = seedUnmanaged();
  // Folders the agent skips, keyed by agent; paths are filled in from the agent's folder.
  let broken: Record<string, Omit<BrokenSkillFolder, "path">[]> = seedBroken();
  const projectCopies = seedProjectCopies();
  const lastExportAgents = seedLastExportAgents();

  const librarySkill = (id: string | null): Skill | undefined =>
    id === null ? undefined : ctx.getSkills().find((entry) => entry.id === id);
  const agentOf = (key: string): AgentInfo | undefined =>
    ctx.getAgents().find((entry) => entry.key === key);

  function toLocalSkill(
    entry: Copy,
    root: string,
    managed: boolean,
    displayName: string,
  ): LocalSkill {
    const match = librarySkill(entry.librarySkillId);
    return {
      name: match?.name ?? dirNameOf(entry.relativePath),
      dirName: dirNameOf(entry.relativePath),
      relativePath: entry.relativePath,
      description: entry.description ?? match?.description ?? null,
      path: `${root}${entry.enabled ? "" : DISABLED_SUFFIX}/${entry.relativePath}`,
      files: entry.status === "local_only" ? ["SKILL.md"] : SKILL_FILES,
      enabled: entry.enabled,
      agentKey: entry.agentKey,
      agentDisplayName: displayName,
      tags: match?.tags ?? [],
      librarySkillId: entry.librarySkillId,
      managed,
      // The preview's codex copies are real copies; every other managed skill is a link.
      linkTarget:
        managed && entry.agentKey !== COPY_AGENT_KEY
          ? `${HOME}/.loadout/skills/${dirNameOf(entry.relativePath)}`
          : null,
      syncStatus: entry.status,
      duplicates: mockDuplicates(entry.agentKey, dirNameOf(entry.relativePath), root, displayName),
    };
  }

  function listAgentFolder(agentKey: string): LocalSkill[] {
    const agent = agentOf(agentKey);
    if (!agent) return [];
    const managed = ctx
      .getSkills()
      .filter((skill) => skill.deployments.some((entry) => entry.agentKey === agentKey))
      .map((skill) =>
        toLocalSkill(
          copy(
            skill.dirName,
            agentKey,
            deployedStatus.get(`${agentKey}:${skill.id}`) ?? "in_sync",
            {
              librarySkillId: skill.id,
            },
          ),
          agent.skillsDir,
          true,
          agent.displayName,
        ),
      );
    const taken = new Set(managed.map((skill) => skill.relativePath));
    const loose = unmanaged
      .filter((entry) => entry.agentKey === agentKey && !taken.has(entry.relativePath))
      .map((entry) => toLocalSkill(entry, agent.skillsDir, false, agent.displayName));
    return [...managed, ...loose].sort((a, b) => a.name.localeCompare(b.name));
  }

  function findProject(id: string): Project {
    const found = ctx.getProjects().find((entry) => entry.id === id);
    return found ?? ctx.fail("NOT_FOUND", `Project not found: ${id}`);
  }

  const targetsOf = (project: Project): ProjectTarget[] => projectTargets(project, ctx.getAgents());

  const agentName = (key: string): string =>
    ctx.getAgents().find((agent) => agent.key === key)?.displayName ?? key;

  const copiesOf = (projectId: string): Copy[] => projectCopies.get(projectId) ?? [];

  function patchCopies(
    projectId: string,
    relativePath: string,
    patch: (entry: Copy) => Copy,
  ): void {
    projectCopies.set(
      projectId,
      copiesOf(projectId).map((entry) => (sameSkill(entry, relativePath) ? patch(entry) : entry)),
    );
    ctx.emitChanged("projects");
  }

  /** New library skill made from a folder on disk. */
  function importToLibrary(name: string, description: string | null): Skill {
    const created = mockImportedSkill(ctx.getSkills()[0] as Skill, name, description);
    ctx.setSkills([...ctx.getSkills(), created]);
    return created;
  }

  function newProject(name: string, path: string, type: Project["type"]): Project {
    if (ctx.getProjects().some((entry) => entry.path === path)) {
      ctx.fail("ALREADY_EXISTS", `This folder is already a workspace: ${path}`);
    }
    const created = mockProject(name, path, type, ctx.getProjects().length);
    ctx.setProjects([...ctx.getProjects(), created]);
    ctx.emitChanged("projects");
    return created;
  }

  return {
    "workspace.list": (agentKey: string) => listAgentFolder(agentKey),
    "workspace.plugins": (agentKey: string) => mockPluginSkills(agentKey),
    "workspace.counts": (agentKeys: string[]) =>
      Object.fromEntries(agentKeys.map((key) => [key, listAgentFolder(key).length])),
    "workspace.document": (agentKey: string, relativePath: string): SkillDocument => {
      const found = listAgentFolder(agentKey).find((entry) => entry.relativePath === relativePath);
      if (!found) return ctx.fail("NOT_FOUND", "This skill is no longer in the folder.");
      return {
        filename: "SKILL.md",
        content: documentFor(found.name, found.description, found.syncStatus !== "in_sync"),
        files: found.files,
        path: `${found.path}/SKILL.md`,
      };
    },
    "workspace.upload": async (agentKey: string, relativePath: string): Promise<Skill> => {
      await wait(STEP_MS);
      const found = listAgentFolder(agentKey).find((entry) => entry.relativePath === relativePath);
      if (!found) return ctx.fail("NOT_FOUND", "This skill is no longer in the folder.");
      const skill =
        librarySkill(found.librarySkillId) ?? importToLibrary(found.dirName, found.description);
      // Adopted: the folder becomes a managed deployment of the library copy.
      unmanaged = unmanaged.filter(
        (entry) => !(entry.agentKey === agentKey && entry.relativePath === relativePath),
      );
      deployedStatus.delete(`${agentKey}:${skill.id}`);
      ctx.setDeployed(skill.id, agentKey, true);
      ctx.emitChanged("skills");
      return skill;
    },
    "workspace.pull": async (agentKey: string, relativePath: string) => {
      await wait(STEP_MS);
      const found = listAgentFolder(agentKey).find((entry) => entry.relativePath === relativePath);
      if (found?.syncStatus === "local_newer") {
        ctx.fail("INVALID_INPUT", "The local skill is newer than the library version.");
      }
      if (found?.librarySkillId) deployedStatus.delete(`${agentKey}:${found.librarySkillId}`);
      const before = unmanaged.find(
        (entry) => entry.agentKey === agentKey && entry.relativePath === relativePath,
      );
      const setStatus = (status: SyncStatus | undefined): void => {
        unmanaged = unmanaged.map((entry) =>
          entry === before || (entry.agentKey === agentKey && entry.relativePath === relativePath)
            ? { ...entry, status: status ?? entry.status }
            : entry,
        );
        ctx.emitChanged("skills");
      };
      setStatus("in_sync");
      if (!found || found.syncStatus === "in_sync") return [];
      const id = recordRemoved(
        {
          name: dirNameOf(relativePath),
          originalPath: found.path,
          place: agentName(agentKey),
          reason: "replaced",
        },
        () => setStatus(before?.status),
      );
      return [id];
    },
    "workspace.broken": (agentKey: string): BrokenSkillFolder[] => {
      const dir = agentOf(agentKey)?.skillsDir ?? "";
      return (broken[agentKey] ?? []).map((entry) => ({
        ...entry,
        path: `${dir}/${entry.relativePath}`,
      }));
    },
    "workspace.deleteBroken": async (agentKey: string, relativePath: string) => {
      await wait(STEP_MS);
      const found = broken[agentKey]?.find((entry) => entry.relativePath === relativePath);
      if (!found) return ctx.fail("NOT_FOUND", `No broken folder at ${relativePath}`);
      if (found.managed) {
        ctx.fail("INVALID_INPUT", "This copy was deployed by the app. Deploy it again instead.");
      }
      if (relativePath === "tmp")
        ctx.fail("IO", "The folder is read-only, so it could not be deleted.");
      broken = {
        ...broken,
        [agentKey]: (broken[agentKey] ?? []).filter((entry) => entry.relativePath !== relativePath),
      };
      ctx.emitChanged("skills");
      const dir = agentOf(agentKey)?.skillsDir ?? "";
      const id = recordRemoved(
        {
          name: found.dirName,
          originalPath: `${dir}/${relativePath}`,
          place: agentName(agentKey),
          reason: "deleted",
        },
        () => {
          broken = { ...broken, [agentKey]: [...(broken[agentKey] ?? []), found] };
          ctx.emitChanged("skills");
        },
      );
      return [id];
    },
    "workspace.deleteLocal": (agentKey: string, relativePath: string) => {
      if (relativePath === "old-linter-rules") {
        ctx.fail("IO", "The folder is read-only, so it could not be deleted.");
      }
      const found = unmanaged.find(
        (entry) => entry.agentKey === agentKey && entry.relativePath === relativePath,
      );
      unmanaged = unmanaged.filter((entry) => entry !== found);
      ctx.emitChanged("skills");
      if (!found) return [];
      const dir = agentOf(agentKey)?.skillsDir ?? "";
      const id = recordRemoved(
        {
          name: dirNameOf(relativePath),
          originalPath: `${dir}/${relativePath}`,
          place: agentName(agentKey),
          reason: "deleted",
        },
        () => {
          unmanaged = [...unmanaged, found];
          ctx.emitChanged("skills");
        },
      );
      return [id];
    },

    "projects.add": async (path: string): Promise<Project> => {
      await wait(STEP_MS);
      if (path.includes("missing"))
        ctx.fail("NOT_FOUND", `Project is not an existing folder: ${path}`);
      return newProject(dirNameOf(path.replace(/\/+$/, "")), path, "project");
    },
    "projects.addLinked": async (name: string, path: string, disabledPath?: string | null) => {
      await wait(STEP_MS);
      if (disabledPath && (disabledPath.startsWith(path) || path.startsWith(disabledPath))) {
        ctx.fail(
          "INVALID_INPUT",
          "The skills folder and the disabled skills folder must not overlap",
        );
      }
      return newProject(name, path, "linked");
    },
    "projects.scan": async (root: string): Promise<string[]> => {
      await wait(STEP_MS * 2);
      if (root.includes("empty")) return [];
      const base = root.replace(/\/+$/, "");
      return SCAN_RESULTS.map((name) => `${base}/${name}`).sort();
    },
    "projects.targets": (id: string) => targetsOf(findProject(id)),
    "projects.skills": (id: string): LocalSkill[] => {
      const project = findProject(id);
      const targets = targetsOf(project);
      return copiesOf(id)
        .flatMap((entry) => {
          const target = targets.find((candidate) => candidate.key === entry.agentKey);
          if (!target) return [];
          const root = target.relativeDir ? `${project.path}/${target.relativeDir}` : project.path;
          return [toLocalSkill(entry, root, false, target.displayName)];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    "projects.document": (id: string, relativePath: string, agentKey: string): SkillDocument => {
      const entry = copiesOf(id).find(
        (candidate) => sameSkill(candidate, relativePath) && candidate.agentKey === agentKey,
      );
      if (!entry) return ctx.fail("NOT_FOUND", "This skill is not in the workspace.");
      const match = librarySkill(entry.librarySkillId);
      const name = match?.name ?? dirNameOf(entry.relativePath);
      return {
        filename: "SKILL.md",
        content: documentFor(
          name,
          entry.description ?? match?.description ?? null,
          entry.status !== "in_sync",
        ),
        files: entry.status === "local_only" ? ["SKILL.md"] : SKILL_FILES,
        path: `${findProject(id).path}/${entry.relativePath}/SKILL.md`,
      };
    },
    "projects.exportSkill": async (skillId: string, id: string, agentKeys?: string[]) => {
      await wait(STEP_MS);
      const skill =
        librarySkill(skillId) ?? ctx.fail("NOT_FOUND", `There is no skill "${skillId}".`);
      const targets = targetsOf(findProject(id)).filter(
        (target) =>
          target.installed &&
          target.enabled &&
          (agentKeys ?? ["claude_code"]).some((key) => target.agentKeys.includes(key)),
      );
      if (targets.length === 0) {
        ctx.fail("INVALID_INPUT", "No enabled installed agents selected for this project");
      }
      for (const target of targets) {
        if (
          copiesOf(id).some(
            (entry) => sameSkill(entry, skill.dirName) && entry.agentKey === target.key,
          )
        ) {
          ctx.fail(
            "ALREADY_EXISTS",
            `Skill "${skill.name}" already exists in this workspace for agent ${target.key}`,
          );
        }
      }
      projectCopies.set(id, [
        ...copiesOf(id),
        ...targets.map((target) =>
          copy(skill.dirName, target.key, "in_sync", { librarySkillId: skill.id }),
        ),
      ]);
      ctx.emitChanged("projects");
    },
    "projects.pushToLibrary": async (
      id: string,
      relativePath: string,
      options?: PushToLibraryOptions,
    ): Promise<PushToLibraryResult> => {
      await wait(STEP_MS);
      const done: PushToLibraryResult = {
        conflictingVariants: 0,
        versions: [],
        realignFailed: 0,
        removedIds: [],
      };
      const variants = copiesOf(id).filter((entry) => sameSkill(entry, relativePath));
      // The preview has no content: every changed copy counts as a version of its own.
      const unsynced = variants.filter((entry) => entry.status !== "in_sync");
      const picked = options?.version
        ? unsynced.find((entry) => entry.agentKey === options.version)
        : unsynced.length === 1
          ? unsynced[0]
          : undefined;
      if (options?.version && !picked)
        ctx.fail("NOT_FOUND", "That version is no longer in the project.");
      if (!picked && unsynced.length > 1) {
        return {
          conflictingVariants: unsynced.length,
          realignFailed: 0,
          removedIds: [],
          versions: unsynced.map((entry, index) => ({
            id: entry.agentKey,
            agents: [{ agentKey: entry.agentKey, agentName: agentName(entry.agentKey) }],
            changedAt: Date.now() - (index + 1) * STEP_MS * 60,
            fileCount: 2 + index,
            documentName: "SKILL.md",
            document: `---\nname: ${dirNameOf(relativePath)}\ndescription: ${entry.description}\n---\n\nEdited for ${agentName(entry.agentKey)}.\n`,
            matchesLibrary: false,
          })),
        };
      }
      if (!picked) return done;
      const skill =
        librarySkill(picked.librarySkillId) ??
        importToLibrary(dirNameOf(picked.relativePath), picked.description);
      patchCopies(id, relativePath, (entry) =>
        options?.realign === false && entry !== picked && entry.status !== "in_sync"
          ? { ...entry, librarySkillId: skill.id, status: "diverged" }
          : { ...entry, status: "in_sync", librarySkillId: skill.id },
      );
      ctx.emitChanged("skills");
      return done;
    },
    "projects.pullFromLibrary": async (id: string, relativePath: string) => {
      await wait(STEP_MS);
      const project = findProject(id);
      const stale = copiesOf(id).filter(
        (entry) =>
          sameSkill(entry, relativePath) && entry.librarySkillId && entry.status !== "in_sync",
      );
      patchCopies(id, relativePath, (entry) =>
        entry.librarySkillId ? { ...entry, status: "in_sync" } : entry,
      );
      return stale.map((variant) =>
        recordRemoved(
          {
            name: dirNameOf(relativePath),
            originalPath: `${project.path}/${variant.relativePath}`,
            place: `${project.name} · ${agentName(variant.agentKey)}`,
            reason: "replaced",
          },
          () =>
            patchCopies(id, relativePath, (entry) =>
              entry.agentKey === variant.agentKey ? { ...entry, status: variant.status } : entry,
            ),
        ),
      );
    },
    "projects.setSkillEnabled": (id: string, relativePath: string, enabled: boolean) => {
      if (!findProject(id).supportsToggle) {
        ctx.fail("UNSUPPORTED", "This workspace does not support disabling skills");
      }
      patchCopies(id, relativePath, (entry) => ({ ...entry, enabled }));
    },
    "projects.deleteSkill": (id: string, relativePath: string, agentKey?: string) => {
      const project = findProject(id);
      const gone = copiesOf(id).filter(
        (entry) =>
          sameSkill(entry, relativePath) && (agentKey === undefined || entry.agentKey === agentKey),
      );
      projectCopies.set(
        id,
        copiesOf(id).filter((entry) => !gone.includes(entry)),
      );
      ctx.emitChanged("projects");
      return gone.map((variant) =>
        recordRemoved(
          {
            name: dirNameOf(variant.relativePath),
            originalPath: `${project.path}/${variant.relativePath}`,
            place: `${project.name} · ${agentName(variant.agentKey)}`,
            reason: "deleted",
          },
          () => {
            projectCopies.set(id, [...copiesOf(id), variant]);
            ctx.emitChanged("projects");
          },
        ),
      );
    },
    "projects.lastExportAgents": (id: string) => lastExportAgents.get(id) ?? [],
    "projects.setLastExportAgents": (id: string, agentKeys: string[]) => {
      lastExportAgents.set(id, [...new Set(agentKeys)]);
    },
  };
}
