import {
  type LocalSkill,
  PROJECT_EXPORT_PRIORITY,
  type ProjectTarget,
  SYNC_STATUS_SEVERITY,
} from "@loadout/shared";

// Relative import (not `@/`) so this module stays loadable by plain vitest.
import type { EnabledState, LocalSkillView } from "../local-skills/local-skill-view";

/**
 * One logical skill of a project: every per-agent copy ("variant") found at the same relative
 * path. `id` is the lowercase relative path and `syncStatus` the worst status among the variants.
 */
export interface ProjectSkillGroup extends LocalSkillView {
  variants: LocalSkill[];
}

export type EnabledFilter = "all" | "enabled" | "disabled";
export const ENABLED_FILTERS: readonly EnabledFilter[] = ["all", "enabled", "disabled"];

export const groupKey = (relativePath: string): string => relativePath.toLowerCase();

const worse = (a: LocalSkill, b: LocalSkill): LocalSkill =>
  SYNC_STATUS_SEVERITY[b.syncStatus] > SYNC_STATUS_SEVERITY[a.syncStatus] ? b : a;

function enabledStateOf(variants: readonly LocalSkill[]): EnabledState {
  const on = variants.filter((variant) => variant.enabled).length;
  if (on === variants.length) return "all";
  return on === 0 ? "none" : "partial";
}

/** Group copies by lowercase relative path, keeping the order the backend returned. */
export function groupProjectSkills(skills: readonly LocalSkill[]): ProjectSkillGroup[] {
  const buckets = new Map<string, LocalSkill[]>();
  for (const skill of skills) {
    const key = groupKey(skill.relativePath);
    buckets.set(key, [...(buckets.get(key) ?? []), skill]);
  }
  return [...buckets].flatMap(([id, variants]) => {
    const first = variants[0];
    if (!first) return [];
    // The copy that needs attention most is the one the card and the sheet describe.
    const lead = variants.reduce(worse, first);
    return [
      {
        id,
        name: lead.name,
        description: lead.description,
        relativePath: lead.relativePath,
        tags: [...new Set(variants.flatMap((variant) => variant.tags))],
        fileCount: lead.files.length,
        syncStatus: lead.syncStatus,
        enabledState: enabledStateOf(variants),
        librarySkillId:
          lead.librarySkillId ??
          variants.find((variant) => variant.librarySkillId !== null)?.librarySkillId ??
          null,
        // Copies of one skill can find the same global copy (agents sharing a folder): once each.
        duplicates: variants
          .flatMap((variant) => variant.duplicates)
          .filter(
            (duplicate, index, all) =>
              all.findIndex(
                (other) => other.path === duplicate.path && other.agentKey === duplicate.agentKey,
              ) === index,
          ),
        variants,
      },
    ];
  });
}

/** The copy the sheet opens on: the one with the worst status. */
export function leadVariant(group: ProjectSkillGroup): LocalSkill | undefined {
  const first = group.variants[0];
  return first ? group.variants.reduce(worse, first) : undefined;
}

export function variantFor(group: ProjectSkillGroup, targetKey: string): LocalSkill | undefined {
  return group.variants.find((variant) => variant.agentKey === targetKey);
}

export function matchesEnabledFilter(group: ProjectSkillGroup, filter: EnabledFilter): boolean {
  if (filter === "all") return true;
  // A partly switched-off skill shows under both, so it cannot hide from either view.
  if (filter === "enabled") return group.enabledState !== "none";
  return group.enabledState !== "all";
}

/** Sync actions a group offers, per its (worst) status. */
export interface ProjectSkillRules {
  /** "Update library": the project holds something the library does not. */
  push: boolean;
  /** "Update project": the library moved on. */
  pull: boolean;
  /** "Restore library version": throw the project's newer changes away. Always confirmed. */
  restore: boolean;
}

export function projectSkillRules(group: ProjectSkillGroup): ProjectSkillRules {
  const status = group.syncStatus;
  return {
    push: status === "local_only" || status === "local_newer" || status === "diverged",
    pull: status === "library_newer" || status === "diverged",
    restore: status === "local_newer",
  };
}

export const isTargetAvailable = (target: ProjectTarget): boolean =>
  target.installed && target.enabled;

/** Place in the export priority list; a merged target ranks as its best-placed member. */
function priorityRank(target: ProjectTarget): number {
  const ranks = target.agentKeys
    .map((key) => PROJECT_EXPORT_PRIORITY.indexOf(key))
    .filter((index) => index !== -1);
  return ranks.length > 0 ? Math.min(...ranks) : PROJECT_EXPORT_PRIORITY.length;
}

/** Available targets, the usual agents first, the rest in the order they were detected. */
export function orderedAvailableTargets(targets: readonly ProjectTarget[]): ProjectTarget[] {
  return targets
    .filter(isTargetAvailable)
    .map((target, index) => ({ target, index }))
    .sort((a, b) => priorityRank(a.target) - priorityRank(b.target) || a.index - b.index)
    .map(({ target }) => target);
}

/** The target an agent key belongs to: its own, or the merged one it shares a folder with. */
export function targetOfAgent(
  targets: readonly ProjectTarget[],
  agentKey: string,
): ProjectTarget | undefined {
  return (
    targets.find((target) => target.key === agentKey) ??
    targets.find((target) => target.agentKeys.includes(agentKey))
  );
}

/**
 * Where a library skill already sits in a project. `byId` holds target keys with a copy linked
 * to that library skill; `byFolder` holds target keys whose folder of that name is taken by
 * anything at all (an export there would be refused).
 */
export interface SkillPresence {
  byId: Map<string, Set<string>>;
  byFolder: Map<string, Set<string>>;
}

function addPresence(index: Map<string, Set<string>>, key: string, targetKey: string): void {
  index.set(key, (index.get(key) ?? new Set<string>()).add(targetKey));
}

export function indexPresence(groups: readonly ProjectSkillGroup[]): SkillPresence {
  const byId = new Map<string, Set<string>>();
  const byFolder = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const variant of group.variants) {
      addPresence(byFolder, group.id, variant.agentKey);
      if (variant.librarySkillId) addPresence(byId, variant.librarySkillId, variant.agentKey);
    }
  }
  return { byId, byFolder };
}

/** Does this target already hold a copy linked to the library skill? */
export function hasSkill(presence: SkillPresence, skillId: string, targetKey: string): boolean {
  return presence.byId.get(skillId)?.has(targetKey) ?? false;
}

/** Is the folder a library skill would be exported to still free for this target? */
export function isFolderFree(presence: SkillPresence, dirName: string, targetKey: string): boolean {
  return !presence.byFolder.get(groupKey(dirName))?.has(targetKey);
}
