/**
 * What Loadout keeps on disk, for the Storage settings page. Everything lives in the home data
 * folder (`~/.loadout`); the library part can be moved elsewhere.
 */

export const STORAGE_AREAS = [
  "skills",
  "database",
  "history",
  "cache",
  "logs",
  "cli",
  "app",
] as const;
export type StorageArea = (typeof STORAGE_AREAS)[number];

/** Areas that can be emptied from Settings without losing anything that is not rebuilt. */
export const CLEARABLE_AREAS = ["history", "cache", "logs"] as const;
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
}
