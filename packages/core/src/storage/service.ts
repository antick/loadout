import { existsSync, truncateSync } from "node:fs";
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
import { keepLinkedSkills, linkedFolders } from "../deploy/keep";
import { logRedeployProblems } from "../deploy/report-log";
import { AppError, invalid } from "../errors";
import type { SkillStore } from "../skills/store";
import type { GitClient } from "../install/git-client";
import { dirSize, lstatOrNull, removePathSync, statOrNull } from "../util/fs";
import type { PublishService } from "../publish/service";
import { listLogFiles } from "../system/logs";
import type { RemovedStore } from "./removed";

/** SQLite keeps these next to the database while it is open. */
const DB_JOURNAL_SUFFIXES = ["", "-wal", "-shm"] as const;

export interface StorageServiceDeps {
  deploy: DeployService;
  store: SkillStore;
  git: GitClient;
  removed: RemovedStore;
  publish: Pick<PublishService, "clearWorkingCopies">;
}

/** What to delete once the app has exited, so nothing it still writes brings a file back. */
export interface RemovalPlan {
  /** Deleted outright. */
  paths: string[];
  /** Removed afterwards only when empty (a moved library's folder may hold other things). */
  emptyDirs: string[];
  /** Deployment rows dropped from agent folders before quitting. */
  undeployed: number;
  /** Copies edited in agents' folders, left there as ordinary folders instead of removed. */
  keptEdited: string[];
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
    removed: () => paths.removedDir,
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

  /**
   * Old logs go; the current log is emptied, since the logger keeps writing to it. The crash
   * notice next to them is not a log: it stays until it has been shown.
   */
  function clearLogs(): number {
    let freed = 0;
    const current = ctx.log.filePath;
    for (const path of listLogFiles(paths.logsDir)) {
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
        freed = (await deps.git.clearCache()) + (await deps.publish.clearWorkingCopies());
      } else if (area === "removed") {
        freed = await deps.removed.clear();
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

    agentFolders: async () => {
      const linked = linkedFolders(deps.store);
      const copies = new Set(
        deps.store
          .deployments()
          .filter((row) => row.mode === "copy" && lstatOrNull(row.targetPath)?.isDirectory())
          .map((row) => row.targetPath),
      );
      return {
        linkedFolders: linked.folders,
        linkedBytes: linked.bytes,
        copiedFolders: copies.size,
      };
    },

    removed: async () => deps.removed.list(),
    restoreRemoved: async (id) => {
      const result = await deps.removed.restore(id);
      // A library skill's folder came back (an earlier version): copies in agents' folders follow
      // it, as after an update. One edited there is kept, never replaced.
      const skill = deps.store.findByLibraryPath(result.path);
      if (skill) {
        const report = await deps.deploy.refreshCopies(skill, { keepModified: true });
        logRedeployProblems(ctx.log, report, "refresh");
      }
      return result;
    },
    deleteRemoved: async (id) => deps.removed.remove(id),
    revealRemoved: async (id) => ctx.host.revealPath(deps.removed.contentPath(id)),
  };

  return {
    api,

    prepareRemoval: async ({ removeCopies, keepLinkedSkills: keepLinks }) => {
      if (keepLinks && !removeCopies) {
        const kept = await keepLinkedSkills(ctx, deps.store);
        // Half kept is worse than not starting: stop while the library is still there.
        if (kept.failed.length > 0) {
          const list = kept.failed.map((failure) => `${failure.name}: ${failure.message}`);
          throw new AppError(
            "IO",
            `Nothing was removed: ${kept.failed.length} skill folders could not be kept. ${list.join("; ")}`,
          );
        }
      }
      const { removed: undeployed, keptEdited } = await deps.deploy.removeEverywhere({
        includeCopies: removeCopies,
      });
      const home = paths.defaultBaseDir;
      const moved = paths.baseDir !== home;
      // A moved library's folder was picked by the user: remove what is ours, then the folder
      // only if nothing else is left in it.
      const libraryParts = moved
        ? [
            paths.skillsDir,
            ...dbFiles(),
            paths.historyDir,
            paths.removedDir,
            paths.cacheDir,
            paths.logsDir,
            paths.lockPath,
          ]
        : [];
      return {
        paths: [...libraryParts, home],
        emptyDirs: moved ? [paths.baseDir] : [],
        undeployed,
        keptEdited,
      };
    },
  };
}
