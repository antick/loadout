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
  /** OS config folder override (tests). */
  configDir?: string;
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
  /** Write any pending portable metadata now. */
  flush(): void;
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

/** Open the library and build the shared context every service receives. */
export function createContext(options: CoreOptions = {}): ContextBundle {
  const home = options.homeDir ?? homedir();
  const resolved = resolveLibrary({
    homeDir: home,
    configDir: options.configDir,
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

  const lock = new RepoLock(resolved.paths.lockPath);

  const writeMetadata = (): void => {
    try {
      portable.write();
    } catch (error) {
      log.error("Could not write portable metadata", error);
    }
  };

  /** Write any pending metadata now, and tell the UI. Used on close, when nothing else runs. */
  const flush = (): void => {
    scheduled = false;
    if (abandoned) return;
    if (metadataDirty) {
      metadataDirty = false;
      writeMetadata();
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
   * The scheduled write takes the library lock: another operation (a backup merge between its
   * steps) must never see its metadata files rewritten, or pruned, under it.
   */
  const flushLater = (): void => {
    scheduled = false;
    if (abandoned) return;
    if (metadataDirty) {
      metadataDirty = false;
      void lock
        .run("write metadata", () => {
          if (!abandoned) writeMetadata();
        })
        .catch((error: unknown) => {
          metadataDirty = true;
          log.warn("Metadata not written yet; will retry on the next change", error);
        });
    }
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
      if (scope.includes("skills") || scope.includes("presets")) metadataDirty = true;
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
      flush();
      db.close();
    },
    abandon: () => {
      abandoned = true;
      db.close();
    },
  };
}
