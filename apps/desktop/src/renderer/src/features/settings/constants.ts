export const SETTINGS_SECTIONS = [
  "agents",
  "general",
  "storage",
  "network",
  "updates",
  "marketplaces",
  "safety",
  "cli",
  "about",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "agents";

export const AGENT_GROUP_IDS = ["detected", "custom", "other"] as const;
export type AgentGroupId = (typeof AGENT_GROUP_IDS)[number];

/** Minutes a skill's last update check counts as fresh. 0 asks the source every time. */
export const UPDATE_CHECK_TTL_OPTIONS = ["0", "15", "60", "360", "1440"] as const;
