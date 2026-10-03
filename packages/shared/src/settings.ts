import {
  DEFAULT_LISTING_WINDOW,
  LISTING_WINDOW_CHOICES,
  type ListingWindow,
} from "./skill-listing";
import { DEPLOY_MODES, type DeployMode } from "./types";

/** Each list is the one place its values are written; the type comes from it. Order is as shown. */
export const THEMES = ["system", "light", "dark"] as const;
export type ThemeSetting = (typeof THEMES)[number];
/** Colour palettes, each with a light and a dark version. Order is the order shown. */
export const PALETTES = ["flight", "blueprint", "risograph", "iris"] as const;
export type PaletteSetting = (typeof PALETTES)[number];
export const TEXT_SIZES = ["small", "default", "large", "xlarge"] as const;
export type TextSizeSetting = (typeof TEXT_SIZES)[number];
export const LANGUAGE_CODES = ["en", "hi"] as const;
export type LanguageSetting = (typeof LANGUAGE_CODES)[number];
/** "ask" shows the close-or-minimise prompt. */
export const CLOSE_ACTIONS = ["ask", "hide", "quit"] as const;
export type CloseActionSetting = (typeof CLOSE_ACTIONS)[number];
export const AUTO_UPDATE_INTERVALS = ["off", "1h", "6h", "24h"] as const;
export type AutoUpdateInterval = (typeof AUTO_UPDATE_INTERVALS)[number];
export const FIRST_RUN_CHOICES = ["", "fresh", "restored"] as const;
export type FirstRunChoice = (typeof FIRST_RUN_CHOICES)[number];
export const AGENT_CONTROL_PROMPTS = ["", "dismissed", "installed"] as const;
export type AgentControlPrompt = (typeof AGENT_CONTROL_PROMPTS)[number];

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
  /** Add skills a repository gains to the library by themselves when a check finds them. */
  autoAddNewSkills: boolean;
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
  /** Run the safety check on every install, before anything is written. */
  safetyScanOnInstall: boolean;
  /** The SkillSpector program to run; empty looks for it on this machine. */
  safetyScannerPath: string;
  /** Read agents' session logs on this computer to count how often each skill runs. */
  usageTracking: boolean;
  /** The context window the skill listing estimate assumes for Claude Code (`skill-listing.ts`). */
  skillListingWindow: ListingWindow;
  /** An `EditorId` the "Open in editor" buttons use; empty for the system's default app. */
  defaultEditor: string;
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
  autoAddNewSkills: false,
  autoUpdateLastRunAt: 0,
  updateCheckTtlMinutes: 60,
  backupAutoEnabled: true,
  backupLastAutoError: "",
  backupFirstRunPrompt: "",
  skillAwareMerge: true,
  githubClientId: "",
  agentControlPrompt: "",
  safetyScanOnInstall: true,
  safetyScannerPath: "",
  usageTracking: false,
  skillListingWindow: DEFAULT_LISTING_WINDOW,
  defaultEditor: "",
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

/**
 * The values a text setting may take. A value outside its list (typed by hand in the CLI, or
 * from an older or newer version) is refused on save and read back as the default.
 */
export const SETTING_CHOICES: Partial<Record<SettingKey, readonly string[]>> = {
  deployMode: DEPLOY_MODES,
  theme: THEMES,
  palette: PALETTES,
  textSize: TEXT_SIZES,
  language: LANGUAGE_CODES,
  closeAction: CLOSE_ACTIONS,
  autoUpdateInterval: AUTO_UPDATE_INTERVALS,
  backupFirstRunPrompt: FIRST_RUN_CHOICES,
  agentControlPrompt: AGENT_CONTROL_PROMPTS,
  skillListingWindow: LISTING_WINDOW_CHOICES,
};

/** Whether `value` is one the setting `key` accepts: its type, its choices, no negative number. */
export function isValidSetting(key: SettingKey, value: unknown): boolean {
  const fallback = DEFAULT_SETTINGS[key];
  if (typeof value !== typeof fallback) return false;
  const choices = SETTING_CHOICES[key];
  if (choices && !choices.includes(value as string)) return false;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  return true;
}
