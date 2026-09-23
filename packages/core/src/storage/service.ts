import { existsSync, readdirSync, truncateSync } from "node:fs";
import { join } from "node:path";
import {
  CLEARABLE_AREAS,
  type ClearableArea,
  type RemoveAllDataOptions,
  type StorageApi,
  type StorageArea,
  type StorageEntry,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { invalid } from "../errors";
import type { GitClient } from "../install/git-client";
import { dirSize, removePathSync, statOrNull } from "../util/fs";

/** SQLite keeps these next to the database while it is open. */
const DB_JOURNAL_SUFFIXES = ["", "-wal", "-shm"] as const;

export interface StorageServiceDeps {
  deploy: DeployService;
  git: GitClient;
}

/** What to delete once the app has exited, so nothing it still writes brings a file back. */
export interface RemovalPlan {
  /** Deleted outright. */
  paths: string[];
  /** Removed afterwards only when empty (a moved library's folder may hold other things). */
  emptyDirs: string[];
  /** Deployment rows dropped from agent folders before quitting. */
  undeployed: number;
}

export interface StorageService {
  api: StorageApi;
  /** Take Loadout's skills out of agent folders and list what to delete after quitting. */
  prepareRemoval(options: RemoveAllDataOptions): Promise<RemovalPlan>;
}

const isClearable = (area: StorageArea): area is ClearableArea =>
  (CLEARABLE_AREAS as readonly string[]).includes(area);

function sizeOf(path: string): number {
  const stat = statOrNull(path);
  if (!stat) return 0;
  return stat.isDirectory() ? dirSize(path) : stat.size;
}

/** Sizes of everything Loadout keeps, and emptying the parts that are rebuilt on demand. */
export function createStorageService(ctx: CoreContext, deps: StorageServiceDeps): StorageService {
  const { paths } = ctx;
  const dbFiles = (): string[] => DB_JOURNAL_SUFFIXES.map((suffix) => `${paths.dbPath}${suffix}`);

  const areaPaths: Record<StorageArea, () => string | null> = {
    skills: () => paths.skillsDir,
    database: () => paths.dbPath,
    history: () => paths.historyDir,
    cache: () => paths.cacheDir,
    logs: () => paths.logsDir,
    cli: () => paths.binDir,
    app: () => ctx.host.appDataDir,
  };

  function entry(area: StorageArea): StorageEntry | null {
    const path = areaPaths[area]();
    if (path === null) return null;
    const bytes =
      area === "database" ? dbFiles().reduce((sum, file) => sum + sizeOf(file), 0) : sizeOf(path);
    return { area, path, bytes, exists: existsSync(path), clearable: isClearable(area) };
  }

  /** Old logs go; the current log is emptied, since the logger keeps writing to it. */
  function clearLogs(): number {
    let freed = 0;
    const current = ctx.log.filePath;
    for (const name of existsSync(paths.logsDir) ? readdirSync(paths.logsDir) : []) {
      const path = join(paths.logsDir, name);
      freed += sizeOf(path);
      if (path === current) truncateSync(path, 0);
      else removePathSync(path);
    }
    return freed;
  }

  const api: StorageApi = {
    report: async () => {
      const entries = (Object.keys(areaPaths) as StorageArea[]).flatMap(
        (area) => entry(area) ?? [],
      );
      return {
        homePath: paths.defaultBaseDir,
        libraryPath: paths.baseDir,
        entries,
        totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0),
      };
    },

    clear: async (area) => {
      if (!isClearable(area)) throw invalid(`${String(area)} cannot be cleared`);
      let freed = 0;
      if (area === "cache") {
        freed = await deps.git.clearCache();
      } else if (area === "history") {
        // Saves record versions under the lock, so none is written halfway through.
        freed = await ctx.lock.run("clear editor history", async () => {
          const size = sizeOf(paths.historyDir);
          removePathSync(paths.historyDir);
          return size;
        });
      } else {
        freed = clearLogs();
      }
      ctx.log.info(`Cleared ${area}: ${freed} bytes`);
      return freed;
    },
  };

  return {
    api,

    prepareRemoval: async ({ removeCopies }) => {
      const undeployed = await deps.deploy.removeEverywhere({ includeCopies: removeCopies });
      const home = paths.defaultBaseDir;
      const moved = paths.baseDir !== home;
      // A moved library's folder was picked by the user: remove what is ours, then the folder
      // only if nothing else is left in it.
      const libraryParts = moved
        ? [
            paths.skillsDir,
            ...dbFiles(),
            paths.historyDir,
            paths.cacheDir,
            paths.logsDir,
            paths.lockPath,
          ]
        : [];
      return {
        paths: [...libraryParts, home],
        emptyDirs: moved ? [paths.baseDir] : [],
        undeployed,
      };
    },
  };
}
