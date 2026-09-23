/** DEV ONLY. `storage.*` and the app's clean-up calls for the browser preview. */
import {
  CLEARABLE_AREAS,
  type ClearableArea,
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
  cache: 48 * MB,
  logs: 0.02 * MB,
  cli: 0.7 * MB,
  app: 31 * MB,
};
const AREA_PATHS: Record<StorageArea, string> = {
  skills: "skills",
  database: "loadout.db",
  history: "history",
  cache: "cache",
  logs: "logs",
  cli: "bin",
  app: "app",
};

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

  return {
    "storage.report": report,
    "storage.clear": (area: ClearableArea) => {
      const freed = Math.round(bytes[area]);
      bytes[area] = 0;
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
