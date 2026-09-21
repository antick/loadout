import {
  DEFAULT_SETTINGS,
  PROXY_URL_PATTERN,
  SETTING_KEYS,
  type SettingKey,
  type SettingValue,
  type Settings,
} from "@loadout/shared";
import type { Database } from "../db/database";
import { invalid } from "../errors";

/**
 * Two kinds of values live in the settings table:
 * typed user settings (see `Settings`), and internal JSON blobs core keeps for itself
 * (agent overrides, per-project memory). Both are stored as JSON text.
 */
export class SettingsStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  getRaw<T>(key: string, fallback: T): T {
    const row = this.#db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  setRaw(key: string, value: unknown): void {
    this.#db.run(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }

  deleteRaw(key: string): void {
    this.#db.run("DELETE FROM settings WHERE key = ?", key);
  }

  get<K extends SettingKey>(key: K): SettingValue<K> {
    const fallback = DEFAULT_SETTINGS[key];
    const value = this.getRaw<SettingValue<K>>(key, fallback);
    return typeof value === typeof fallback ? value : fallback;
  }

  set<K extends SettingKey>(key: K, value: SettingValue<K>): void {
    if (!SETTING_KEYS.includes(key)) throw invalid(`Unknown setting: ${key}`);
    if (typeof value !== typeof DEFAULT_SETTINGS[key]) throw invalid(`Wrong value type for ${key}`);
    if (key === "proxyUrl") {
      const url = String(value).trim();
      if (url && !PROXY_URL_PATTERN.test(url)) {
        throw invalid("Proxy URL must start with http://, https://, or socks5://");
      }
      this.setRaw(key, url);
      return;
    }
    this.setRaw(key, value);
  }

  all(): Settings {
    const entries = SETTING_KEYS.map((key) => [key, this.get(key)] as const);
    return Object.fromEntries(entries) as unknown as Settings;
  }

  /** Proxy for outgoing git and HTTP calls, or null for a direct connection. */
  proxy(): string | null {
    return this.get("proxyUrl") || null;
  }
}

/** Keys of the internal JSON blobs. */
export const INTERNAL_KEYS = {
  disabledAgents: "agents.disabled",
  agentOrder: "agents.order",
  customAgents: "agents.custom",
  agentPathOverrides: "agents.pathOverrides",
  agentProjectPathOverrides: "agents.projectPathOverrides",
  backupRemoteUrl: "backup.remoteUrl",
  backupDeviceName: "backup.deviceName",
  backupRestoredFrom: "backup.restoredFrom",
  githubAuthMethod: "backup.githubAuthMethod",
  projectExportAgents: (projectId: string) => `projects.exportAgents:${projectId}`,
} as const;
