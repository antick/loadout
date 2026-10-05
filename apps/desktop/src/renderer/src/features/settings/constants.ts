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
