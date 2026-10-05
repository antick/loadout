/** Backup types added after `types-system.ts`, kept apart to keep both files small. */

import type { FileDiffEntry } from "./types";

/**
 * What stays out of the backup, as `.gitignore` lines. `defaults` are the app's own and always
 * apply; `custom` are the user's, shared with every device through the backup.
 */
export interface BackupIgnoreRules {
  defaults: string[];
  custom: string[];
}

/** The user's answer to a sync review, sent with the sync it approves. */
export interface SyncReviewAnswer {
  /** The remote commit the review was made against. A sync against another one stops. */
  remoteCommit: string;
  /** Skills another device deleted that stay here instead, and go back to the remote. */
  keep: string[];
}

/**
 * What a sync would do to one skill. `details`: only its tags or source changed. `renamed`: its
 * folder name changed.
 */
export type SyncChange = "added" | "changed" | "renamed" | "details" | "deleted";

export interface SyncPreviewItem {
  /** Skill id, the same on every device. */
  id: string;
  name: string;
  change: SyncChange;
  /** Its folder in the library now, or where it arrives. */
  path: string | null;
  /** The folder name it had before a rename. */
  previousPath: string | null;
  /** The device that made the change, for changes coming in. */
  fromDevice: string | null;
}

/**
 * What the next sync would do, worked out without changing anything. Conflicts are skills changed
 * differently on both sides: this computer's version stays and they wait for a choice.
 */
export interface SyncPreview {
  /** The remote commit this preview was made against; null when there is no remote branch. */
  remoteCommit: string | null;
  /**
   * The library on this computer as the preview saw it, as a git tree id. Compare with
   * `BackupApi.localTree()` to tell whether it changed since. Null when there was nothing to compare.
   */
  localTree: string | null;
  /**
   * False when the skill-aware merge is off: then only the counts below are known, and of the
   * skills only the ones the merge deletes (`incoming`, as `deleted`).
   */
  perSkill: boolean;
  incoming: SyncPreviewItem[];
  outgoing: SyncPreviewItem[];
  conflicts: SyncPreviewItem[];
  /** Presets that would take another device's version. */
  presetsIncoming: number;
  /** Backups on the remote this computer has not merged yet. */
  remoteBackups: number;
  /** The deletions coming in are many: without a review the sync would stop. */
  manyDeletes: boolean;
}

/** One skill compared between this computer (`before`) and another device (`after`). */
export interface SyncSkillDiff {
  name: string;
  entries: FileDiffEntry[];
}

/**
 * Where a sync, or the review before it, is right now. `preparing`: refreshing the ignore list and
 * checking for keys; `comparing`: working out the review.
 */
export type BackupStage =
  | "preparing"
  | "saving"
  | "downloading"
  | "comparing"
  | "merging"
  | "uploading";

/** `stage` is null once the sync or review finished, whether it worked or not. */
export interface BackupProgress {
  stage: BackupStage | null;
}
