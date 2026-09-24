export const APP_NAME = "Loadout";
export const APP_ID = "sh.potion.loadout";
/** Folder name under the home directory, and the prefix for anything else we name on disk. */
export const APP_SLUG = "loadout";
export const LIBRARY_DIR_NAME = `.${APP_SLUG}`;
/**
 * Inside the home data folder (`~/.loadout`), next to the library: the desktop app's own files
 * (window state, encrypted credentials, interface preferences, Electron caches). The development
 * build keeps its own, so both can run side by side.
 */
export const APP_DATA_DIR_NAME = "app";
export const DEV_APP_DATA_DIR_NAME = "app-dev";
/** Where the library lives when it is not in the home data folder. Kept in the home folder. */
export const LIBRARY_CONFIG_FILE = "library.json";
/** Published command-line tool, in the home data folder. */
export const CLI_BIN_DIR_NAME = "bin";
export const CLI_BINARY_NAME = APP_SLUG;

/** File names that mark a folder as a skill, in priority order. */
export const SKILL_MARKER_FILES = ["SKILL.md", "skill.md"] as const;
/** Files shown as a skill's document when present, in priority order. */
export const SKILL_DOCUMENT_FILES = [
  "SKILL.md",
  "skill.md",
  "CLAUDE.md",
  "claude.md",
  "README.md",
  "readme.md",
] as const;

/** The source repository. Its GitHub releases hold the installers and the update feed. */
export const RELEASES_REPO = "antick/loadout";
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`;
/** Page of the newest published release. */
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
/** Which file to download and what to click on first launch. */
export const INSTALL_GUIDE_URL = `https://github.com/${RELEASES_REPO}/blob/main/docs/INSTALL.md`;
/** Release file describing the release: version and one download per system. */
export const UPDATE_FEED_FILE = "latest.json";
/** Always the feed of the newest published (not draft, not prerelease) release. */
export const UPDATE_FEED_URL = `${RELEASES_URL}/latest/download/${UPDATE_FEED_FILE}`;

export const MARKETPLACE_NAME = "skills.sh";
export const MARKETPLACE_URL = "https://skills.sh";

/** Name of the bundled skill that teaches agents to drive the CLI. */
export const AGENT_CONTROL_SKILL_NAME = "manage-skills";

export const DEFAULT_BACKUP_REPO_NAME = `${APP_SLUG}-backup`;
export const DEFAULT_BACKUP_COMMIT_MESSAGE = "backup: sync skills library";
export const SNAPSHOT_TAG_PREFIX = "lo-v-";

export const BACKUP_SKILL_LIMIT_BYTES = 100 * 1024 * 1024;
export const BACKUP_REPO_WARN_BYTES = 1024 * 1024 * 1024;

export const SYNC_STATUS_SEVERITY = {
  in_sync: 1,
  local_only: 2,
  library_newer: 3,
  local_newer: 4,
  diverged: 5,
} as const;
