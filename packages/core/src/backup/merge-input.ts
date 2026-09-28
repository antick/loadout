import {
  BACKUP_DELETE_GUARD_COUNT,
  BACKUP_DELETE_GUARD_MIN,
  CLI_BINARY_NAME,
  type SyncReviewAnswer,
} from "@loadout/shared";
import { AppError } from "../errors";
import { listConflicts } from "./conflict-store";
import type { BackupEnv } from "./env";
import {
  type MergePlan,
  type PresetVersions,
  type ResidualVersions,
  type SkillVersions,
  planMerge,
} from "./merge-plan";
import { type CommitSnapshot, readCommit } from "./merge-read";

/**
 * Everything a skill-aware merge decides from, read from three commits: the common ancestor,
 * ours and theirs. Shared by the merge itself and by the sync review, which runs the same
 * decision on a throwaway commit of the working tree without changing anything.
 */

export interface MergeSides {
  base: CommitSnapshot;
  ours: CommitSnapshot;
  theirs: CommitSnapshot;
  /**
   * Both sides carry our metadata folder. Without it (a repository filled by hand, or by
   * something else) every skill would read as deleted, so only git's line merge is safe.
   */
  describable: boolean;
}

export interface PlannedMerge {
  skills: Map<string, SkillVersions>;
  presets: Map<string, PresetVersions>;
  plan: MergePlan;
}

export function collect<T>(
  sides: { base: Map<string, T>; ours: Map<string, T>; theirs: Map<string, T> },
  skip: (key: string) => boolean = () => false,
): Map<string, { base?: T; ours?: T; theirs?: T }> {
  const merged = new Map<string, { base?: T; ours?: T; theirs?: T }>();
  for (const side of ["base", "ours", "theirs"] as const) {
    for (const [key, value] of sides[side]) {
      if (skip(key)) continue;
      merged.set(key, { ...merged.get(key), [side]: value });
    }
  }
  return merged;
}

export async function readSides(
  env: BackupEnv,
  base: string,
  ours: string,
  theirs: string,
): Promise<MergeSides> {
  const [baseSide, ourSide, theirSide] = await Promise.all([
    readCommit(env, base),
    readCommit(env, ours),
    readCommit(env, theirs),
  ]);
  const describable = [ourSide, theirSide].every((side) => side.entries.has(env.metadataName));
  return { base: baseSide, ours: ourSide, theirs: theirSide, describable };
}

/** Decide every skill, preset and loose entry. `keep`: remote deletions the user turned down. */
export function planSides(
  env: BackupEnv,
  sides: MergeSides,
  keep: ReadonlySet<string> = new Set(),
): PlannedMerge {
  const skills: Map<string, SkillVersions> = collect({
    base: sides.base.skills,
    ours: sides.ours.skills,
    theirs: sides.theirs.skills,
  });
  const presets: Map<string, PresetVersions> = collect({
    base: sides.base.presets,
    ours: sides.ours.presets,
    theirs: sides.theirs.presets,
  });
  const claimed = new Set<string>([env.metadataName]);
  for (const versions of skills.values()) {
    for (const side of [versions.base, versions.ours, versions.theirs]) {
      if (side) claimed.add(side.path);
    }
  }
  // A skill whose metadata is broken on either side is left exactly as it is here. Its folders
  // stay claimed above, so the whole-entry merge below keeps its hands off them too.
  for (const id of [...sides.ours.unreadable, ...sides.theirs.unreadable]) {
    skills.delete(id);
    env.ctx.log.warn(`Backup merge skipped a skill with unreadable metadata: ${id}`);
  }
  const residual: Map<string, ResidualVersions> = collect(
    { base: sides.base.entries, ours: sides.ours.entries, theirs: sides.theirs.entries },
    (name) => claimed.has(name),
  );
  const plan = planMerge({
    skills,
    presets,
    residual,
    pendingConflicts: new Set(listConflicts(env.ctx.db).map((row) => row.skillKey)),
    keepDeleted: keep,
  });
  return { skills, presets, plan };
}

/** Skills here that the merge would take out because another device deleted them. */
export function departingSkills(planned: PlannedMerge): string[] {
  return planned.plan.skills
    .filter((item) => item.outcome === "deleted" && planned.skills.get(item.id)?.ours)
    .map((item) => item.id);
}

/**
 * More deletions than a person plausibly made on purpose: more than `BACKUP_DELETE_GUARD_COUNT`,
 * or at least `BACKUP_DELETE_GUARD_MIN` that are over half of the skills here. Most often a
 * sign that the other device lost its library (an empty or unreadable folder) and synced that.
 */
export function manyDeletes(planned: PlannedMerge): boolean {
  const count = departingSkills(planned).length;
  let here = 0;
  for (const versions of planned.skills.values()) if (versions.ours) here += 1;
  return (
    count > BACKUP_DELETE_GUARD_COUNT || (count >= BACKUP_DELETE_GUARD_MIN && count * 2 > here)
  );
}

/** The review was made against another remote state: its answers may not fit any more. */
export function planChanged(): AppError {
  return new AppError(
    "SYNC_PLAN_CHANGED",
    "Another device synced while you were reviewing. Nothing was changed. Review the changes again.",
  );
}

/**
 * Refuse a merge the user has not seen when it would delete many skills here. A review answer
 * counts as seen only when it was made against this very remote commit.
 */
export function assertDeletesReviewed(
  planned: PlannedMerge,
  names: (id: string) => string,
  theirs: string,
  review: SyncReviewAnswer | undefined,
): void {
  if (review) {
    if (review.remoteCommit !== theirs) throw planChanged();
    return;
  }
  if (!manyDeletes(planned)) return;
  const departing = departingSkills(planned)
    .map(names)
    .sort((a, b) => a.localeCompare(b));
  throw new AppError(
    "SYNC_MANY_DELETES",
    `Sync stopped: it would delete ${departing.length} skills on this computer that were deleted on another device (${departing.join(", ")}). Nothing was changed. Review them first: press Sync on the Backup page, or run \`${CLI_BINARY_NAME} git sync --dry-run\`.`,
    { count: departing.length, skills: departing },
  );
}
