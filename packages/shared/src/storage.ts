/**
 * What Loadout keeps on disk, for the Storage settings page. Everything lives in the home data
 * folder (`~/.loadout`); the library part can be moved elsewhere.
 */

export const STORAGE_AREAS = [
  "skills",
  "database",
  "history",
  "removed",
  "cache",
  "logs",
  "cli",
  "app",
] as const;
export type StorageArea = (typeof STORAGE_AREAS)[number];

/** Areas that can be emptied from Settings without losing anything that is not rebuilt. */
export const CLEARABLE_AREAS = ["history", "removed", "cache", "logs"] as const;
export type ClearableArea = (typeof CLEARABLE_AREAS)[number];

export interface StorageEntry {
  area: StorageArea;
  /** Folder or file. The database entry names its main file; its journal files count too. */
  path: string;
  /** Bytes on disk; 0 when it does not exist (yet). */
  bytes: number;
  exists: boolean;
  clearable: boolean;
}

export interface StorageReport {
  /** The home data folder, `~/.loadout`. */
  homePath: string;
  /** The library: the home folder unless it was moved. */
  libraryPath: string;
  entries: StorageEntry[];
  totalBytes: number;
}

export interface RemoveAllDataOptions {
  /**
   * Also delete the skill copies Loadout put into agent folders. Links into the library are
   * always removed, because they would point at nothing afterwards.
   */
  removeCopies: boolean;
  /**
   * Before anything goes, turn every link into the library into a real copy of the skill, so
   * agents keep all their skills. Ignored when `removeCopies` is set. If any link cannot be
   * turned into a folder, nothing is removed.
   */
  keepLinkedSkills?: boolean;
}

/** What Loadout put into agent folders, counted once per folder on disk. */
export interface AgentFolderSummary {
  /** Links into the library. */
  linkedFolders: number;
  /** Space those links would take as real folders. */
  linkedBytes: number;
  /** Copies of library skills. */
  copiedFolders: number;
}

/**
 * Why a skill folder went to Recently removed. `deleted_elsewhere`: a library skill another
 * device deleted, taken out here by a backup sync.
 */
export type RemovedReason = "replaced" | "deleted" | "deleted_elsewhere";

/** Library folder that holds Recently removed. Stays on this computer, like editor history. */
export const REMOVED_DIR_NAME = "removed";

/** Days a removed folder is kept before it is deleted for good. */
export const REMOVED_KEEP_DAYS = 30;

/**
 * A skill folder Loadout took out of an agent's or a project's folder, because the user replaced
 * it with the library version or deleted it. Kept so it can be put back.
 */
export interface RemovedFolder {
  id: string;
  /** The folder's name where it lived. */
  name: string;
  originalPath: string;
  /** Where it lived, in words: an agent ("Claude Code"), or a project and its agent. */
  place: string;
  reason: RemovedReason;
  removedAt: number;
  /** When it is deleted for good. */
  expiresAt: number;
  bytes: number;
  /** Something else sits at `originalPath` now; restoring puts that aside first. */
  occupied: boolean;
  /** The folder it lived in is gone, so it cannot be put back. */
  parentMissing: boolean;
  /**
   * A skill deleted from the library. It goes back as the same skill, tags and presets included,
   * and never displaces what is at `originalPath` now: an occupied path blocks the restore.
   */
  library: boolean;
}

export interface RestoreRemovedResult {
  path: string;
  /** What stood at the path and was put aside in its place; null when the path was free. */
  displacedId: string | null;
}
