import type { DeployMode } from "./types";

export type ThemeSetting = "light" | "dark" | "system";
/** Colour palettes, each with a light and a dark version. Order is the order shown. */
export const PALETTES = ["flight", "blueprint", "risograph", "iris"] as const;
export type PaletteSetting = (typeof PALETTES)[number];
export type TextSizeSetting = "small" | "default" | "large" | "xlarge";
export type LanguageSetting = "en" | "zh" | "hi";
/** "ask" shows the close-or-minimise prompt. */
export type CloseActionSetting = "ask" | "hide" | "quit";
export type AutoUpdateInterval = "off" | "1h" | "6h" | "24h";
export type FirstRunChoice = "" | "fresh" | "restored";
export type AgentControlPrompt = "" | "dismissed" | "installed";

/** Every user-facing setting, with its value type. Stored as JSON strings in the settings table. */
export interface Settings {
  deployMode: DeployMode;
  theme: ThemeSetting;
  palette: PaletteSetting;
  textSize: TextSizeSetting;
  language: LanguageSetting;
  closeAction: CloseActionSetting;
  showTrayIcon: boolean;
  proxyUrl: string;
  autoUpdateInterval: AutoUpdateInterval;
  autoUpdateApply: boolean;
  /** Epoch ms of the last background update round, 0 when never run. */
  autoUpdateLastRunAt: number;
  updateCheckTtlMinutes: number;
  backupAutoEnabled: boolean;
  backupLastAutoError: string;
  backupFirstRunPrompt: FirstRunChoice;
  /** Merge synced changes per skill instead of per text line. */
  skillAwareMerge: boolean;
  /** OAuth app client id for GitHub device sign-in. Empty hides that option. */
  githubClientId: string;
  agentControlPrompt: AgentControlPrompt;
}

export type SettingKey = keyof Settings;
export type SettingValue<K extends SettingKey> = Settings[K];

export const DEFAULT_SETTINGS: Settings = {
  deployMode: "symlink",
  theme: "system",
  palette: "flight",
  textSize: "default",
  language: "en",
  closeAction: "ask",
  showTrayIcon: true,
  proxyUrl: "",
  autoUpdateInterval: "off",
  autoUpdateApply: false,
  autoUpdateLastRunAt: 0,
  updateCheckTtlMinutes: 60,
  backupAutoEnabled: true,
  backupLastAutoError: "",
  backupFirstRunPrompt: "",
  skillAwareMerge: true,
  githubClientId: "",
  agentControlPrompt: "",
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

export const TEXT_SIZE_SCALE: Record<TextSizeSetting, number> = {
  small: 0.9,
  default: 1,
  large: 1.1,
  xlarge: 1.2,
};

export const AUTO_UPDATE_INTERVAL_MS: Record<AutoUpdateInterval, number> = {
  off: 0,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

export const PROXY_URL_PATTERN = /^(https?|socks5):\/\//i;
