import { homedir } from "node:os";
import { join } from "node:path";
import type { DataScope } from "@loadout/shared";
import { ActivityLog } from "./activity";
import {
  type CoreContext,
  type EnvReader,
  type EventSink,
  type HostBridge,
  type SecretStore,
  noSecretStore,
} from "./context";
import { Database } from "./db/database";
import { AppError } from "./errors";
import { RepoLock } from "./lock";
import { type Logger, createFileLogger } from "./log";
import { ensureLibraryDirs, isAppRunning, resolveLibrary } from "./paths";
import { SettingsStore } from "./settings/store";
import { createSkillInspector } from "./skills/checks";
import { PortableMetadata } from "./skills/portable";
import { SkillStore } from "./skills/store";
import { createGitHubSignIn } from "./util/github-token";

export interface CoreOptions {
  homeDir?: string;
  /** Use this library folder instead of the saved location (CLI `--library`, tests). */
  baseDir?: string;
  /**
   * Carry out a library move queued in Settings. Defaults to "only when the desktop app is not
   * open", so a CLI run never moves the library out from under the running app.
   */
  migrateLibrary?: boolean;
  secrets?: SecretStore;
  host?: Partial<HostBridge>;
  emit?: EventSink;
  logger?: Logger;
  /** Mirror log lines to the console. */
  echoLogs?: boolean;
  /**
   * Environment to read agents' home folder variables from. Defaults to this process's, except
   * with a `homeDir` override (tests), where the machine's own variables must not leak in.
   */
  env?: EnvReader;
}

export interface ContextBundle {
  ctx: CoreContext;
  store: SkillStore;
  portable: PortableMetadata;
  /**
   * Write any pending portable metadata now, holding the library lock (waiting for it like any
   * operation). When the library stays busy the write is skipped: the database keeps the change
   * and the next locked write carries it.
   */
  flush(): Promise<void>;
  /** Write pending metadata only if the lock is free right now, then close the database. */
  close(): void;
  /** Close the database without writing the portable metadata. */
  abandon(): void;
}

const DEV_VERSION = "0.0.0-dev";

function defaultHost(home: string): HostBridge {
  return {
    appVersion: DEV_VERSION,
    revealPath: async () => undefined,
    bundledSkillDir: null,
    bundledCliPath: null,
    nodeRunner: null,
    downloadsDir: join(home, "Downloads"),
    appDataDir: null,
  };
}

/**
 * Open the library and build the shared context every service receives. `onLibraryChanged` runs
 * on every change to skills or presets.
 */
export function createContext(
  options: CoreOptions = {},
  onLibraryChanged: () => void = () => undefined,
): ContextBundle {
  const home = options.homeDir ?? homedir();
  const resolved = resolveLibrary({
    homeDir: home,
    baseDir: options.baseDir,
    migrate: options.migrateLibrary ?? !isAppRunning(home),
  });
  if (resolved.unavailable) {
    throw new AppError(
      "LIBRARY_UNAVAILABLE",
      `The library at ${resolved.paths.baseDir} is not available. If it is on another disk, connect that disk and try again.`,
      { path: resolved.paths.baseDir },
    );
  }
  ensureLibraryDirs(resolved.paths);

  const log = options.logger ?? createFileLogger(resolved.paths.logsDir, options.echoLogs);
  for (const note of resolved.notes) log.warn(note);

  const db = new Database(resolved.paths.dbPath);
  const store = new SkillStore(db, createSkillInspector());
  const host: HostBridge = { ...defaultHost(home), ...options.host };
  const portable = new PortableMetadata(resolved.paths, db, store, log, host.appVersion);
  const emit: EventSink = options.emit ?? (() => undefined);

  let metadataDirty = false;
  let pendingScopes = new Set<DataScope>();
  let scheduled = false;
  let abandoned = false;
  let closed = false;

  const lock = new RepoLock(resolved.paths.lockPath);

  const writeMetadata = (): void => {
    try {
      portable.write();
    } catch (error) {
      log.error("Could not write portable metadata", error);
    }
  };

  /**
   * Write pending metadata, and tell the UI. Never without the lock: a backup merge in another
   * process must not see its metadata files rewritten, or pruned, under it. When the library is
   * busy the metadata stays pending, and the next change carries it.
   */
  const flush = async (): Promise<void> => {
    scheduled = false;
    if (abandoned || closed) return;
    if (metadataDirty) {
      metadataDirty = false;
      try {
        await lock.run("write metadata", () => {
          if (!abandoned && !closed) writeMetadata();
        });
      } catch (error) {
        metadataDirty = true;
        log.warn("Metadata not written: the library is busy; the next write carries it", error);
      }
    }
    announce();
  };

  /** The last write before closing: only when the lock is free at this moment. */
  const flushNow = (): void => {
    scheduled = false;
    if (abandoned || closed) return;
    if (metadataDirty) {
      const written = lock.holdSync("write metadata", writeMetadata);
      if (written) metadataDirty = false;
      else
        log.warn("Metadata not written on close: the library is busy; the next write carries it");
    }
    announce();
  };

  const announce = (): void => {
    if (pendingScopes.size > 0) {
      const scope = [...pendingScopes];
      pendingScopes = new Set();
      emit("data:changed", { scope });
    }
  };

  /**
   * The scheduled write, on its own turn at the lock. The UI hears of the change at once, not
   * only once a busy library lets the metadata be written.
   */
  const flushLater = (): void => {
    if (abandoned || closed) return;
    void flush();
    announce();
  };

  const env: EnvReader =
    options.env ?? (options.homeDir === undefined ? () => process.env : () => ({}));
  const ctx: CoreContext = {
    paths: resolved.paths,
    homeDir: home,
    env,
    db,
    settings: new SettingsStore(db),
    lock,
    log,
    activity: new ActivityLog(db),
    secrets: options.secrets ?? noSecretStore,
    github: createGitHubSignIn(env),
    host,
    warnings: resolved.warnings,
    emit,
    touched: (...scope) => {
      for (const item of scope) pendingScopes.add(item);
      if (scope.includes("skills") || scope.includes("presets")) {
        metadataDirty = true;
        onLibraryChanged();
      }
      if (scheduled) return;
      scheduled = true;
      // Its own turn at the lock: called inside an operation, it waits for that one to finish.
      setImmediate(() => lock.outside(flushLater));
    },
  };

  return {
    ctx,
    store,
    portable,
    flush,
    close: () => {
      flushNow();
      closed = true;
      db.close();
    },
    abandon: () => {
      abandoned = true;
      db.close();
    },
  };
}
