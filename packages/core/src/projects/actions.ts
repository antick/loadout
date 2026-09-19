import { renameSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LocalSkill, PushToLibraryResult, Skill } from "@skillboard/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { writeTarget } from "../deploy";
import { AppError, errorMessage, exists, invalid, notFound, unsupported } from "../errors";
import { ensureDir, isInside, lstatOrNull, removePath } from "../util/fs";
import {
  type LocalSyncDeps,
  pushLocalToLibrary,
  replaceLocalFromLibrary,
} from "../workspace/local-actions";
import { indexLibrary } from "../workspace/local-scan";
import { type Variant, findVariants, groupKey, listProjectSkills } from "./scan";
import type { ProjectRecord } from "./store";
import {
  DEFAULT_PROJECT_AGENT_KEY,
  type ResolvedTarget,
  findTarget,
  isAvailable,
  resolveTargets,
} from "./targets";

export interface ProjectActionsDeps extends LocalSyncDeps {
  registry: AgentRegistry;
}

export interface ProjectActions {
  setSkillEnabled(project: ProjectRecord, relativePath: string, enabled: boolean): Promise<void>;
  exportSkill(skill: Skill, project: ProjectRecord, agentKeys?: string[]): Promise<void>;
  pushToLibrary(project: ProjectRecord, relativePath: string): Promise<PushToLibraryResult>;
  pullFromLibrary(project: ProjectRecord, relativePath: string): Promise<void>;
  deleteSkill(project: ProjectRecord, relativePath: string, agentKey?: string): Promise<void>;
}

const NOT_IN_WORKSPACE = "Skill not found in this workspace";

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
      return target && isAvailable(target) ? [target] : [];
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
            throw invalid("Duplicate skill entry is not a symlink — resolve manually");
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

      for (const leftover of leftovers) {
        await removePath(leftover.path);
        pruneDisabledSide(leftover);
      }
      for (const { variant, to } of moves) {
        ensureDir(dirname(to));
        renameSync(variant.path, to);
        pruneDisabledSide(variant);
      }
      if (leftovers.length + moves.length > 0) ctx.touched("projects");
    },

    exportSkill: async (skill, project, agentKeys) => {
      const targets = exportTargets(project, agentKeys);
      if (targets.length === 0) {
        throw invalid("No enabled installed agents selected for this project");
      }
      // Check every target before writing to any: an export lands everywhere or nowhere.
      for (const target of targets) {
        const roots = [target.enabledRoot, target.disabledRoot].flatMap((root) => root ?? []);
        if (roots.some((root) => lstatOrNull(join(root, skill.dirName)))) {
          throw exists(
            `Skill "${skill.name}" already exists in this workspace for agent ${target.key}`,
          );
        }
      }
      const mode = ctx.settings.get("deployMode");
      await ctx.lock.run(`export ${skill.name}`, async () => {
        for (const target of targets) {
          const path = join(target.enabledRoot, skill.dirName);
          await writeTarget(skill.libraryPath, path, mode, { kind: "no_clobber" });
        }
      });
      const names = targets.map((target) => target.displayName).join(", ");
      ctx.activity.record("deploy", skill.name, `${project.name}: ${names}`);
      ctx.touched("projects");
    },

    pushToLibrary: async (project, relativePath) => {
      const variants = variantsOf(project, relativePath);
      if (variants.length === 0) throw notFound(NOT_IN_WORKSPACE);
      // Equal content is the only proof a copy holds nothing of its own. Two copies without that
      // proof cannot both win, and picking one would silently drop the other's changes.
      const unsynced = variants.filter((variant) => variant.syncStatus !== "in_sync");
      if (unsynced.length > 1) return { conflictingVariants: unsynced.length, realignFailed: 0 };
      const winner = unsynced[0];
      if (!winner) return { conflictingVariants: 0, realignFailed: 0 };

      const match = winner.librarySkillId ? store.find(winner.librarySkillId) : null;
      const pushed = await pushLocalToLibrary(ctx, deps, winner, match);

      let realignFailed = 0;
      // One at a time: each replace stages a sibling folder, and targets can share a parent.
      for (const other of variants) {
        if (other === winner) continue;
        try {
          await replaceLocalFromLibrary(ctx, pushed, other.path);
        } catch (error) {
          realignFailed += 1;
          ctx.log.warn(`Could not realign ${other.path}: ${errorMessage(error)}`);
        }
      }
      ctx.touched("skills", "projects");
      return { conflictingVariants: 0, realignFailed };
    },

    pullFromLibrary: async (project, relativePath) => {
      const variants = variantsOf(project, relativePath);
      if (variants.length === 0) throw notFound(NOT_IN_WORKSPACE);
      const matched = variants.find((variant) => variant.librarySkillId !== null);
      const shared = matched?.librarySkillId ? store.find(matched.librarySkillId) : null;
      if (!shared) throw notFound("This skill is not in the library");

      const failures: string[] = [];
      const stale = variants.filter((variant) => variant.syncStatus !== "in_sync");
      for (const variant of stale) {
        const own = variant.librarySkillId ? store.find(variant.librarySkillId) : null;
        try {
          await replaceLocalFromLibrary(ctx, own ?? shared, variant.path);
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
    },

    deleteSkill: async (project, relativePath, agentKey) => {
      const targets = targetsOf(project);
      const only = agentKey ? findTarget(targets, agentKey) : null;
      if (agentKey && !only) throw notFound(`Unknown agent for this workspace: ${agentKey}`);
      const variants = findVariants(only ? [only] : targets, relativePath);
      if (variants.length === 0) throw notFound(NOT_IN_WORKSPACE);
      for (const variant of variants) {
        await removePath(variant.path);
        pruneDisabledSide(variant);
      }
      ctx.activity.record("remove", variants[0]?.relativePath ?? relativePath, project.name);
      ctx.touched("projects");
    },
  };
}
