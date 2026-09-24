import { INSTALL_GUIDE_URL, LATEST_RELEASE_URL } from "@loadout/shared";

/** Where the page lives, and the links it points at. One place to change them. */
export const SITE_URL = "https://loadout.potion.sh";
export const PARENT_URL = "https://potion.sh";
export const PARENT_NAME = "potion.sh";

/**
 * Where installers are published: the newest release in the public releases repository. Empty
 * would make the page say installers are not published yet.
 */
export const DOWNLOADS_URL = LATEST_RELEASE_URL;
/** Builds are not signed yet: the first launch needs one extra click, explained here. */
export const INSTALL_GUIDE = INSTALL_GUIDE_URL;

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
