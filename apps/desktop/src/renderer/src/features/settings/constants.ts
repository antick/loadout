export const SETTINGS_SECTIONS = [
  "agents",
  "general",
  "storage",
  "network",
  "updates",
  "backup",
  "cli",
  "about",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "agents";

export const AGENT_GROUP_IDS = ["detected", "custom", "other"] as const;
export type AgentGroupId = (typeof AGENT_GROUP_IDS)[number];

export const AUTO_UPDATE_INTERVALS = ["off", "1h", "6h", "24h"] as const;
/** Minutes a skill's last update check counts as fresh. 0 asks the source every time. */
export const UPDATE_CHECK_TTL_OPTIONS = ["0", "15", "60", "360", "1440"] as const;
export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export const TEXT_SIZE_OPTIONS = ["small", "default", "large", "xlarge"] as const;
export const DEPLOY_MODES = ["symlink", "copy"] as const;
export const CLOSE_ACTIONS = ["ask", "hide", "quit"] as const;
