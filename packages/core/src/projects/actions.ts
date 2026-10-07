import { rmdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type CreateSkillInput,
  DEFAULT_PROJECT_AGENT_KEY,
  isAgentAvailable,
  type LocalSkill,
  SKILL_FILE,
  newSkillDocument,
  type ProjectCopyRef,
  type PushToLibraryOptions,
  type PushToLibraryResult,
  type Skill,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { writeTarget } from "../deploy";
import {
  AppError,
  errorMessage,
  exists,
  invalid,
  isAppError,
  notFound,
  unsupported,
} from "../errors";
import { checkNewSkill } from "../skills/create";
import {
  ensureDir,
  isInside,
  lstatOrNull,
  moveEntrySync,
  readDirSafe,
  removePath,
} from "../util/fs";
import {
  type LocalSyncDeps,
  pushLocalToLibrary,
  replaceLocalFromLibrary,
} from "../workspace/local-actions";
import { indexLibrary } from "../workspace/local-scan";
import { type Variant, findVariants, groupKey, listProjectSkills } from "./scan";
import type { ProjectRecord } from "./store";
import { type VersionGroup, describeVersion, groupByContent } from "./versions";
import { type ResolvedTarget, findTarget, resolveTargets } from "./targets";
import { PLACE_SEPARATOR } from "../util/text";

export interface ProjectActionsDeps extends LocalSyncDeps {
  registry: AgentRegistry;
}

export interface ProjectActions {
  setSkillEnabled(project: ProjectRecord, relativePath: string, enabled: boolean): Promise<void>;
  exportSkill(skill: Skill, project: ProjectRecord, agentKeys?: string[]): Promise<void>;
  createSkill(
    project: ProjectRecord,
    input: CreateSkillInput,
    agentKeys?: string[],
  ): Promise<ProjectCopyRef>;
  pushToLibrary(
    project: ProjectRecord,
    relativePath: string,
    options?: PushToLibraryOptions,
  ): Promise<PushToLibraryResult>;
  pullFromLibrary(project: ProjectRecord, relativePath: string): Promise<string[]>;
  deleteSkill(project: ProjectRecord, relativePath: string, agentKey?: string): Promise<string[]>;
}

const NOT_IN_WORKSPACE = "Skill not found in this workspace";
const VERSION_GONE = "That version is no longer in the project. Refresh and choose again.";

/** A project copy's place in Recently removed: the project, then the agent folder it sat in. */
const placeOf = (project: ProjectRecord, agentName: string): string =>
  `${project.name}${PLACE_SEPARATOR}${agentName}`;

/**
 * Remove folders left empty by a move or a delete, from `start` up to `root`. `rmdir` refuses a
 * folder that still holds anything, which is exactly the stop condition wanted.
 */
function pruneEmptyDirs(start: string, root: string, includeRoot: boolean): void {
  let dir = start;
  while (isInside(root, dir)) {
    const atRoot = isInside(dir, root);
    if (atRoot && !includeRoot) return;
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
    if (atRoot) return;
    dir = dirname(dir);
  }
}

/** Tidy the parking side after a skill left it. */
function pruneDisabledSide(variant: Variant): void {
  const root = variant.target.disabledRoot;
  if (variant.enabled || !root) return;
  pruneEmptyDirs(dirname(variant.path), root, variant.target.ownsDisabledRoot);
}

/** Everything that changes skills inside a project or linked workspace. */
export function createProjectActions(ctx: CoreContext, deps: ProjectActionsDeps): ProjectActions {
  const { store, registry } = deps;

  const targetsOf = (project: ProjectRecord): ResolvedTarget[] => resolveTargets(project, registry);

  /** The copies of one skill, compared with the library as it is right now. */
  function variantsOf(project: ProjectRecord, relativePath: string): LocalSkill[] {
    const library = indexLibrary(store.list(), store.deployments());
    const wanted = groupKey(relativePath);
    return listProjectSkills(targetsOf(project), library).filter(
      (skill) => groupKey(skill.relativePath) === wanted,
    );
  }

  /** Targets to export to: the linked workspace's own, or the chosen agents that can be used. */
  function exportTargets(project: ProjectRecord, agentKeys?: string[]): ResolvedTarget[] {
    const targets = targetsOf(project);
    if (project.type === "linked") return targets;
    const keys = agentKeys?.length ? agentKeys : [DEFAULT_PROJECT_AGENT_KEY];
    const chosen = keys.flatMap((key) => {
      const target = findTarget(targets, key);
      return target && isAgentAvailable(target) ? [target] : [];
    });
    // Two keys resolving to one folder are one write.
    return [...new Set(chosen)];
  }

  return {
    setSkillEnabled: async (project, relativePath, enabled) => {
      const targets = targetsOf(project);
      if (targets.every((target) => !target.disabledRoot)) {
        throw unsupported("This workspace does not support disabling skills");
      }
      const variants = findVariants(targets, relativePath);
      if (variants.length === 0) {
        throw notFound(
          enabled ? "Skill directory not found in skills-disabled" : "Skill directory not found",
        );
      }

      // Decide everything first, so a refusal leaves every copy where it was.
      const moves: { variant: Variant; to: string }[] = [];
      const leftovers: Variant[] = [];
      for (const target of targets) {
        const toRoot = enabled ? target.enabledRoot : target.disabledRoot;
        if (!toRoot) continue;
        const here = variants.filter((variant) => variant.target === target);
        const source = here.find((variant) => variant.enabled !== enabled);
        const settled = here.some((variant) => variant.enabled === enabled);
        if (!source) continue;
        if (settled) {
          // Already where it should be; a second copy is only ours to drop when it is a link.
          if (!lstatOrNull(source.path)?.isSymbolicLink()) {
            throw invalid("Duplicate skill entry is not a symlink. Resolve it manually");
          }
          leftovers.push(source);
          continue;
        }
        const to = join(toRoot, ...source.relativePath.split("/"));
        if (lstatOrNull(to)) {
          throw exists(
            enabled
              ? "Skill already exists in skills directory"
              : "Skill already exists in skills-disabled directory",
          );
        }
        moves.push({ variant: source, to });
      }

      if (leftovers.length + moves.length === 0) return;
      await ctx.lock.run(`toggle ${relativePath}`, async () => {
        for (const leftover of leftovers) {
          await removePath(leftover.path);
          pruneDisabledSide(leftover);
        }
        for (const { variant, to } of moves) {
          ensureDir(dirname(to));
          // A linked workspace can park skills on another disk: moved by copy there.
          moveEntrySync(variant.path, to);
          pruneDisabledSide(variant);
        }
      });
      ctx.touched("projects");
    },

    exportSkill: async (skill, project, agentKeys) => {
      const targets = exportTargets(project, agentKeys);
      if (targets.length === 0) {
        throw invalid("No enabled installed agents selected for this project");
      }
      const mode = ctx.settings.get("deployMode");
      await ctx.lock.run(`export ${skill.name}`, async () => {
        // Check every target before writing to any: an export lands everywhere or nowhere.
        for (const target of targets) {
          const roots = [target.enabledRoot, target.disabledRoot].flatMap((root) => root ?? []);
          if (roots.some((root) => lstatOrNull(join(root, skill.dirName)))) {
            throw exists(
              `Skill "${skill.name}" already exists in this workspace for agent ${target.key}`,
            );
          }
        }
        const written: string[] = [];
        for (const target of targets) {
          const path = join(target.enabledRoot, skill.dirName);
          try {
            await writeTarget(skill.libraryPath, path, mode, { kind: "no_clobber" });
          } catch (error) {
            // Nothing was there before (checked above): what this call wrote is its own to take back.
            for (const done of written) await removePath(done);
            if (isAppError(error)) throw error;
            throw new AppError(
              "IO",
              `Could not add ${skill.name} for ${target.displayName}: ${errorMessage(error)}. Nothing was added.`,
            );
          }
          written.push(path);
        }
      });
      const names = targets.map((target) => target.displayName).join(", ");
      ctx.activity.record("deploy", skill.name, `${project.name}: ${names}`);
      ctx.touched("projects");
    },

    createSkill: async (project, input, agentKeys) => {
      const checked = checkNewSkill(input);
      const { name } = checked;
      const targets = exportTargets(project, agentKeys);
      const [first] = targets;
      if (!first) throw invalid("No enabled installed agents selected for this project");
      const takenBy = (target: ResolvedTarget) =>
        exists(`${target.displayName} already has a skill named ${name} in this project`);
      // Compared without case, like the library, so the name never sits next to a near twin.
      const wanted = name.toLowerCase();
      const document = newSkillDocument(checked);
      // Checked and written in one hold, so a second call for the name sees the first one's folder.
      await ctx.lock.run(`create ${name}`, async () => {
        for (const target of targets) {
          const roots = [target.enabledRoot, target.disabledRoot].flatMap((root) => root ?? []);
          const taken = roots.some((root) =>
            readDirSafe(root).some((entry) => entry.name.toLowerCase() === wanted),
          );
          if (taken) throw takenBy(target);
        }
        const written: string[] = [];
        try {
          for (const target of targets) {
            const dir = join(target.enabledRoot, name);
            // Nothing made means the folder was already there: refused, never written into.
            if ((await mkdir(dir, { recursive: true })) === undefined) throw takenBy(target);
            written.push(dir);
            await writeFile(join(dir, SKILL_FILE), document);
          }
        } catch (error) {
          // Everywhere or nowhere: take back the folders this call made.
          for (const dir of written) await removePath(dir);
          throw error;
        }
      });
      const names = targets.map((target) => target.displayName).join(", ");
      ctx.activity.record("create", name, `${project.name}: ${names}`);
      ctx.touched("projects");
      return { relativePath: name, agentKey: first.key };
    },

    pushToLibrary: async (project, relativePath, options = {}) => {
      const variants = variantsOf(project, relativePath);
      if (variants.length === 0) throw notFound(NOT_IN_WORKSPACE);
      const libraryId = variants.find((variant) => variant.librarySkillId)?.librarySkillId ?? null;
      const match = libraryId ? store.find(libraryId) : null;
      const groups = groupByContent(variants);
      // Copies with the library's content hold nothing of their own.
      const changed = groups.filter((group) => !match || group.hash !== match.contentHash);

      let winner: VersionGroup | undefined;
      if (options.version !== undefined) {
        winner = groups.find((group) => group.hash === options.version);
        if (!winner) throw notFound(VERSION_GONE);
      } else if (changed.length > 1) {
        // Identical copies are one version. Only copies that really differ need a choice, and
        // picking one silently would drop the others' changes.
        return {
          conflictingVariants: changed.length,
          versions: groups.map((group) => describeVersion(group, match?.contentHash ?? null)),
          realignFailed: 0,
          removedIds: [],
        };
      } else {
        winner = changed[0];
      }
      if (!winner?.copies[0]) {
        return { conflictingVariants: 0, versions: [], realignFailed: 0, removedIds: [] };
      }

      const pushed = await pushLocalToLibrary(ctx, deps, winner.copies[0], match);
      let realignFailed = 0;
      const removedIds: string[] = [];
      if (options.realign !== false) {
        // One at a time: each replace stages a sibling folder, and targets can share a parent.
        for (const group of groups) {
          if (group === winner) continue;
          for (const other of group.copies) {
            try {
              const aside = {
                removed: deps.removed,
                place: placeOf(project, other.agentDisplayName),
              };
              const kept = await replaceLocalFromLibrary(ctx, pushed, other.path, aside);
              if (kept) removedIds.push(kept);
            } catch (error) {
              realignFailed += 1;
              ctx.log.warn(`Could not realign ${other.path}: ${errorMessage(error)}`);
            }
          }
        }
      }
      ctx.touched("skills", "projects");
      return { conflictingVariants: 0, versions: [], realignFailed, removedIds };
    },

    pullFromLibrary: async (project, relativePath) => {
      const variants = variantsOf(project, relativePath);
      if (variants.length === 0) throw notFound(NOT_IN_WORKSPACE);
      const matched = variants.find((variant) => variant.librarySkillId !== null);
      const shared = matched?.librarySkillId ? store.find(matched.librarySkillId) : null;
      if (!shared) throw notFound("This skill is not in the library");

      const failures: string[] = [];
      const removedIds: string[] = [];
      const stale = variants.filter((variant) => variant.syncStatus !== "in_sync");
      for (const variant of stale) {
        const own = variant.librarySkillId ? store.find(variant.librarySkillId) : null;
        try {
          const aside = {
            removed: deps.removed,
            place: placeOf(project, variant.agentDisplayName),
          };
          const kept = await replaceLocalFromLibrary(ctx, own ?? shared, variant.path, aside);
          if (kept) removedIds.push(kept);
        } catch (error) {
          failures.push(errorMessage(error));
        }
      }
      const ok = failures.length === 0;
      ctx.activity.record("update", shared.name, `${project.name}: restored from the library`, ok);
      ctx.touched("projects");
      if (!ok) {
        throw new AppError(
          "IO",
          `Could not update ${failures.length} of ${stale.length} copies: ${failures[0]}`,
        );
      }
      return removedIds;
    },

    deleteSkill: async (project, relativePath, agentKey) => {
      const targets = targetsOf(project);
      const only = agentKey ? findTarget(targets, agentKey) : null;
      if (agentKey && !only) throw notFound(`Unknown agent for this workspace: ${agentKey}`);
      const variants = findVariants(only ? [only] : targets, relativePath);
      if (variants.length === 0) throw notFound(NOT_IN_WORKSPACE);
      const removedIds: string[] = [];
      await ctx.lock.run(`delete ${relativePath}`, async () => {
        for (const variant of variants) {
          const kept = deps.removed.setAside(variant.path, {
            place: placeOf(project, variant.target.displayName),
            reason: "deleted",
          });
          if (kept) removedIds.push(kept);
          else await removePath(variant.path);
          pruneDisabledSide(variant);
        }
      });
      ctx.activity.record("remove", variants[0]?.relativePath ?? relativePath, project.name);
      ctx.touched("projects");
      return removedIds;
    },
  };
}
