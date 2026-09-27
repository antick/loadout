/** DEV ONLY. `storage.*` and the app's clean-up calls for the browser preview. */
import {
  CLEARABLE_AREAS,
  type ClearableArea,
  REMOVED_KEEP_DAYS,
  type RemovedFolder,
  type RemovedReason,
  type RestoreRemovedResult,
  type StorageArea,
  type StorageEntry,
  type StorageReport,
} from "@loadout/shared";

type Handler = (...args: never[]) => unknown;

const MB = 1024 * 1024;
const SEED_BYTES: Record<StorageArea, number> = {
  skills: 2.4 * MB,
  database: 0.3 * MB,
  history: 0.1 * MB,
  removed: 0.05 * MB,
  cache: 48 * MB,
  logs: 0.02 * MB,
  cli: 0.7 * MB,
  app: 31 * MB,
};
const AREA_PATHS: Record<StorageArea, string> = {
  skills: "skills",
  database: "loadout.db",
  history: "history",
  removed: "removed",
  cache: "cache",
  logs: "logs",
  cli: "bin",
  app: "app",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTRY_BYTES = 12 * 1024;

interface MockRemoved {
  entry: RemovedFolder;
  /** Puts the folder back into the mock agent or project it came from. */
  putBack: () => void;
}

const removedEntries: MockRemoved[] = [];
let removedSeq = 0;

/** A mock action took a folder away: list it in Recently removed. Returns its id. */
export function recordRemoved(
  folder: {
    name: string;
    originalPath: string;
    place: string;
    reason: RemovedReason;
    library?: boolean;
  },
  putBack: () => void,
): string {
  removedSeq += 1;
  const removedAt = Date.now();
  const id = `00000000-0000-4000-8000-${String(removedSeq).padStart(12, "0")}`;
  removedEntries.unshift({
    entry: {
      ...folder,
      library: folder.library ?? false,
      id,
      removedAt,
      expiresAt: removedAt + REMOVED_KEEP_DAYS * DAY_MS,
      bytes: ENTRY_BYTES,
      occupied: folder.reason === "replaced" && !folder.library,
      parentMissing: false,
    },
    putBack,
  });
  return id;
}

export function createStorageMockHandlers(home: string): Record<string, Handler> {
  const base = `${home}/.loadout`;
  const bytes = { ...SEED_BYTES };

  const report = (): StorageReport => {
    const entries = (Object.keys(bytes) as StorageArea[]).map((area): StorageEntry => ({
      area,
      path: `${base}/${AREA_PATHS[area]}`,
      bytes: Math.round(bytes[area]),
      exists: bytes[area] > 0,
      clearable: (CLEARABLE_AREAS as readonly string[]).includes(area),
    }));
    return {
      homePath: base,
      libraryPath: base,
      entries,
      totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  };

  const take = (id: string): MockRemoved => {
    const index = removedEntries.findIndex((item) => item.entry.id === id);
    const found = removedEntries[index];
    if (!found) throw new Error("That folder is no longer in Recently removed");
    removedEntries.splice(index, 1);
    return found;
  };

  return {
    "storage.report": report,
    "storage.removed": (): RemovedFolder[] => removedEntries.map((item) => item.entry),
    "storage.restoreRemoved": (id: string): RestoreRemovedResult => {
      const found = take(id);
      found.putBack();
      return { path: found.entry.originalPath, displacedId: null };
    },
    "storage.deleteRemoved": (id: string) => {
      take(id);
    },
    "storage.revealRemoved": () => undefined,
    "storage.clear": (area: ClearableArea) => {
      const freed = Math.round(bytes[area]);
      bytes[area] = 0;
      if (area === "removed") removedEntries.length = 0;
      return freed;
    },
    "app.clearAppCache": () => {
      bytes.app = 1.2 * MB;
    },
    "app.removeAllData": () => {
      throw new Error("The preview cannot remove data.");
    },
  };
}
