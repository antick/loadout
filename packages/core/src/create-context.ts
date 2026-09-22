import { homedir } from "node:os";
import { join } from "node:path";
import type { DataScope } from "@loadout/shared";
import { ActivityLog } from "./activity";
import {
  type CoreContext,
  type EventSink,
  type HostBridge,
  type SecretStore,
  noSecretStore,
} from "./context";
import { Database } from "./db/database";
import { RepoLock } from "./lock";
import { type Logger, createFileLogger } from "./log";
import { ensureLibraryDirs, resolveLibrary } from "./paths";
import { SettingsStore } from "./settings/store";
import { createSkillInspector } from "./skills/checks";
import { PortableMetadata } from "./skills/portable";
import { SkillStore } from "./skills/store";

export interface CoreOptions {
  homeDir?: string;
  /** OS config folder override (tests). */
  configDir?: string;
  /** Use this library folder instead of the saved location (CLI `--library`, tests). */
  baseDir?: string;
  secrets?: SecretStore;
  host?: Partial<HostBridge>;
  emit?: EventSink;
  logger?: Logger;
  /** Mirror log lines to the console. */
  echoLogs?: boolean;
}

export interface ContextBundle {
  ctx: CoreContext;
  store: SkillStore;
  portable: PortableMetadata;
  /** Write any pending portable metadata now. */
  flush(): void;
  close(): void;
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
  };
}

/** Open the library and build the shared context every service receives. */
export function createContext(options: CoreOptions = {}): ContextBundle {
  const home = options.homeDir ?? homedir();
  const resolved = resolveLibrary({
    homeDir: home,
    configDir: options.configDir,
    baseDir: options.baseDir,
  });
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

  const flush = (): void => {
    scheduled = false;
    if (metadataDirty) {
      metadataDirty = false;
      try {
        portable.write();
      } catch (error) {
        log.error("Could not write portable metadata", error);
      }
    }
    if (pendingScopes.size > 0) {
      const scope = [...pendingScopes];
      pendingScopes = new Set();
      emit("data:changed", { scope });
    }
  };

  const ctx: CoreContext = {
    paths: resolved.paths,
    homeDir: home,
    db,
    settings: new SettingsStore(db),
    lock: new RepoLock(resolved.paths.lockPath),
    log,
    activity: new ActivityLog(db),
    secrets: options.secrets ?? noSecretStore,
    host,
    warnings: resolved.warnings,
    emit,
    touched: (...scope) => {
      for (const item of scope) pendingScopes.add(item);
      if (scope.includes("skills") || scope.includes("presets")) metadataDirty = true;
      if (scheduled) return;
      scheduled = true;
      setImmediate(flush);
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
  };
}
