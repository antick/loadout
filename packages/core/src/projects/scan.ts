import { join } from "node:path";
import {
  type LocalSkill,
  SYNC_STATUS_SEVERITY,
  type SyncHealth,
  type SyncStatus,
} from "@loadout/shared";
import { isDirectory, readDirSafe } from "../util/fs";
import { toLocalSkill } from "../workspace/local-actions";
import {
  type LibraryIndex,
  type LocalSkillDir,
  findLocalSkillDirs,
  scanSkillRoot,
} from "../workspace/local-scan";
import type { ResolvedTarget } from "./targets";

/** Levels below the chosen root that are searched for projects; the root itself is level 0. */
const PROJECT_SCAN_MAX_DEPTH = 4;
/** Dependency, build and cache folders: large, and never where a project of the user's lives. */
const SKIPPED_DIR_NAMES: ReadonlySet<string> = new Set(["node_modules", "target", "__pycache__"]);
const HIDDEN_PREFIX = ".";
/** Project skills folders may hold namespace folders, so they are always searched in depth. */
const PROJECT_SCAN = { recursive: true } as const;

/**
 * Folders under `root` that hold any agent's project skills folder. A project is not searched
 * for further projects inside it. Links are not followed, which also rules out loops.
 */
export function findProjects(root: string, skillDirs: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (skillDirs.some((relative) => isDirectory(join(dir, relative)))) {
      found.push(dir);
      return;
    }
    if (depth >= PROJECT_SCAN_MAX_DEPTH) return;
    for (const entry of readDirSafe(dir)) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(HIDDEN_PREFIX) || SKIPPED_DIR_NAMES.has(entry.name)) continue;
      walk(join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return found.sort((a, b) => a.localeCompare(b));
}

/** A copy of a project skill: which target holds it and on which side. */
export interface Variant extends LocalSkillDir {
  target: ResolvedTarget;
  enabled: boolean;
}

/** The folders a target reads, switched-on side first. */
function sides(target: ResolvedTarget): { root: string; enabled: boolean }[] {
  const enabledSide = { root: target.enabledRoot, enabled: true };
  return target.disabledRoot
    ? [enabledSide, { root: target.disabledRoot, enabled: false }]
    : [enabledSide];
}

/** Copies of one skill are the folders sharing a relative path, whatever its letter case. */
export const groupKey = (relativePath: string): string =>
  relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/")
    .toLowerCase();

/** Every copy of the skill at `relativePath`, found without hashing anything. */
export function findVariants(targets: ResolvedTarget[], relativePath: string): Variant[] {
  const wanted = groupKey(relativePath);
  return targets.flatMap((target) =>
    sides(target).flatMap(({ root, enabled }) =>
      findLocalSkillDirs(root, PROJECT_SCAN)
        .filter((dir) => groupKey(dir.relativePath) === wanted)
        .map((dir) => ({ path: dir.path, relativePath: dir.relativePath, target, enabled })),
    ),
  );
}

/** Every skill copy in the workspace, compared with the library, sorted by name. */
export function listProjectSkills(targets: ResolvedTarget[], library: LibraryIndex): LocalSkill[] {
  const skills = targets.flatMap((target) =>
    sides(target).flatMap(({ root, enabled }) =>
      scanSkillRoot(root, PROJECT_SCAN).map((entry) =>
        toLocalSkill(entry, library, "loose", {
          agentKey: target.key,
          agentDisplayName: target.displayName,
          enabled,
        }),
      ),
    ),
  );
  return skills.sort(
    (a, b) => a.name.localeCompare(b.name) || a.agentDisplayName.localeCompare(b.agentDisplayName),
  );
}

/** The status of a skill with several copies is the one that most needs attention. */
export function worstStatus(variants: readonly { syncStatus: SyncStatus }[]): SyncStatus {
  return variants.reduce<SyncStatus>(
    (worst, variant) =>
      SYNC_STATUS_SEVERITY[variant.syncStatus] > SYNC_STATUS_SEVERITY[worst]
        ? variant.syncStatus
        : worst,
    "in_sync",
  );
}

export function groupSkills(skills: LocalSkill[]): Map<string, LocalSkill[]> {
  const groups = new Map<string, LocalSkill[]>();
  for (const skill of skills) {
    const key = groupKey(skill.relativePath);
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return groups;
}

export function summarize(skills: LocalSkill[]): { skillCount: number; syncHealth: SyncHealth } {
  const syncHealth: SyncHealth = {
    local_only: 0,
    in_sync: 0,
    local_newer: 0,
    library_newer: 0,
    diverged: 0,
  };
  const groups = groupSkills(skills);
  for (const variants of groups.values()) syncHealth[worstStatus(variants)] += 1;
  return { skillCount: groups.size, syncHealth };
}
