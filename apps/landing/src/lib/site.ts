/** Where the page lives, and the links it points at. One place to change them. */
export const SITE_URL = "https://loadout.potion.sh";
export const PARENT_URL = "https://potion.sh";
export const PARENT_NAME = "potion.sh";

/**
 * Where installers are published. Empty while there is no public release: the page then says so
 * instead of showing download buttons that lead nowhere.
 */
export const DOWNLOADS_URL = "";

/** The skill the hero shows being linked into agents' folders. */
export const HERO_SKILL = "code-review";
/** Agents the hero offers, by key. The first `HERO_LINKED` start linked. */
export const HERO_AGENT_KEYS = [
  "claude_code",
  "codex",
  "cursor",
  "gemini_cli",
  "github_copilot",
  "opencode",
] as const;
export const HERO_LINKED = 3;

export const LIBRARY_DIR = "~/.loadout/skills";
