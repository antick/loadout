import type { AppEvents, LibraryWarning } from "@loadout/shared";
import type { ActivityLog } from "./activity";
import type { Database } from "./db/database";
import { unsupported } from "./errors";
import type { RepoLock } from "./lock";
import type { Logger } from "./log";
import type { LibraryPaths } from "./paths";
import type { SettingsStore } from "./settings/store";
import type { GitHubSignIn } from "./util/github-token";

/** Where credentials live. The desktop app backs this with the OS keychain; the CLI has none. */
export interface SecretStore {
  available(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const noSecretStore: SecretStore = {
  available: () => false,
  get: async () => null,
  set: async () => {
    throw unsupported("No credential store is available here");
  },
  delete: async () => undefined,
};

export type EventSink = <K extends keyof AppEvents>(event: K, payload: AppEvents[K]) => void;

/** Things the host environment does for core: open folders, locate bundled files. */
export interface HostBridge {
  appVersion: string;
  /** Show a folder in the OS file manager. */
  revealPath(path: string): Promise<void>;
  /** Folder holding the bundled management skill, or null when not shipped. */
  bundledSkillDir: string | null;
  /** Built CLI script to publish for agents, or null when not shipped. */
  bundledCliPath: string | null;
  /** Program and leading arguments that run a Node script (the app's own runtime). */
  nodeRunner: { command: string; env: Record<string, string> } | null;
  downloadsDir: string;
  /** The desktop app's own data folder (`~/.loadout/app`), or null outside the app. */
  appDataDir: string | null;
}

/** Environment variables as the user's shell sets them, read on every call. */
export type EnvReader = () => Readonly<Record<string, string | undefined>>;

/** Everything a service needs. Built once by `createCore`. */
export interface CoreContext {
  paths: LibraryPaths;
  homeDir: string;
  /** Where agents' home folder variables (`CODEX_HOME`, …) are read from. */
  env: EnvReader;
  db: Database;
  settings: SettingsStore;
  lock: RepoLock;
  log: Logger;
  activity: ActivityLog;
  secrets: SecretStore;
  /** A GitHub token the computer already has (environment or GitHub CLI), git's last resort. */
  github: GitHubSignIn;
  host: HostBridge;
  warnings: LibraryWarning[];
  emit: EventSink;
  /**
   * Record that the library changed: refreshes the portable metadata and tells the UI.
   * Call after any mutation of skills, tags, presets or deployments.
   */
  touched(...scope: AppEvents["data:changed"]["scope"]): void;
}
