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
/** In the app data folder while the desktop app runs: its process id. */
export const APP_RUNNING_FILE = "running.pid";
/** Where the library lives when it is not in the home data folder. Kept in the home folder. */
export const LIBRARY_CONFIG_FILE = "library.json";
/** Published command-line tool, in the home data folder. */
export const CLI_BIN_DIR_NAME = "bin";
export const CLI_BINARY_NAME = APP_SLUG;
/**
 * Where Homebrew, the system and snap put programs. An app started from the Dock or a desktop
 * launcher gets a bare `PATH`, so these are looked in too.
 */
export const SYSTEM_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/snap/bin"];

/** Folder inside the library that holds one folder per skill. */
export const LIBRARY_SKILLS_DIR_NAME = "skills";

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
/** The source code on GitHub. */
export const SOURCE_URL = `https://github.com/${RELEASES_REPO}`;
export const RELEASES_URL = `${SOURCE_URL}/releases`;
/** Page of the newest published release. */
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
/** Release pages live under the tag, which is `v` plus the version. */
export const RELEASE_TAG_URL = `${RELEASES_URL}/tag/v`;
/** Form for a new issue; the `title` and `body` query parameters fill it in. */
export const NEW_ISSUE_URL = `${SOURCE_URL}/issues/new`;
/** Which file to download and what to click on first launch. */
export const INSTALL_GUIDE_URL = `https://github.com/${RELEASES_REPO}/blob/main/docs/INSTALL.md`;
/** Release file describing the release: version and one download per system. */
export const UPDATE_FEED_FILE = "latest.json";
/** Always the feed of the newest published (not draft, not prerelease) release. */
export const UPDATE_FEED_URL = `${RELEASES_URL}/latest/download/${UPDATE_FEED_FILE}`;
/** Next to the feed: its ed25519 signature, base64. */
export const UPDATE_FEED_SIGNATURE_SUFFIX = ".sig";
/**
 * The public half of the release signing key (SPKI DER, base64). A feed not signed with its
 * private half, which lives only in the release workflow's secrets, is never trusted.
 */
export const UPDATE_FEED_PUBLIC_KEY =
  "MCowBQYDK2VwAyEA70VnSphucHrQQC3mcrZf0J0Yl5iaspjQItuNafYfszA=";

export const MARKETPLACE_NAME = "skills.sh";
export const MARKETPLACE_URL = "https://skills.sh";
/** The second marketplace: a registry with its own API, versions and security scans. */
export const CLAWHUB_NAME = "ClawHub";
export const CLAWHUB_URL = "https://clawhub.ai";
export const CLAWHUB_API_URL = "https://clawhub.ai/api/v1";
/** A skill's page on ClawHub. */
export function clawhubSkillUrl(owner: string, slug: string): string {
  return `${CLAWHUB_URL}/${encodeURIComponent(owner)}/skills/${encodeURIComponent(slug)}`;
}
/** Results a marketplace search returns when the caller names no limit. */
export const MARKET_SEARCH_DEFAULT_LIMIT = 50;

/** Name of the bundled skill that teaches agents to drive the CLI. */
export const AGENT_CONTROL_SKILL_NAME = "manage-skills";

export const DEFAULT_BACKUP_REPO_NAME = `${APP_SLUG}-backup`;
export const DEFAULT_BACKUP_COMMIT_MESSAGE = "backup: sync skills library";
/** Prefix of the snapshot tags older versions made. None are made now; old ones stay. */
export const SNAPSHOT_TAG_PREFIX = "lo-v-";

export const BACKUP_SKILL_LIMIT_BYTES = 100 * 1024 * 1024;
export const BACKUP_REPO_WARN_BYTES = 1024 * 1024 * 1024;
/**
 * A sync that would delete more skills here than this, because another device deleted them,
 * stops and asks first. So does one deleting at least `BACKUP_DELETE_GUARD_MIN` that are more
 * than half of the skills here.
 */
export const BACKUP_DELETE_GUARD_COUNT = 5;
export const BACKUP_DELETE_GUARD_MIN = 3;
/** How long a connect to a public GitHub repository waits in memory for the user's OK. */
export const GITHUB_PUBLIC_CONFIRM_MS = 10 * 60 * 1000;
/** The user's own "leave out of the backup" patterns: at most this many lines, this long each. */
export const BACKUP_IGNORE_MAX_LINES = 200;
export const BACKUP_IGNORE_MAX_LINE_LENGTH = 300;

export const SYNC_STATUS_SEVERITY = {
  in_sync: 1,
  local_only: 2,
  library_newer: 3,
  local_newer: 4,
  diverged: 5,
} as const;

/** `loadout doctor` names a source whose skills were not checked for updates in this long. */
export const SOURCE_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Archives Loadout writes (export) as well as reads. */
export const ZIP_SUFFIXES = [".zip", ".skill"] as const;
/** Read only. `.tar.gz` comes before `.tar` so the longest match wins. */
export const TAR_SUFFIXES = [".tar.gz", ".tgz", ".tar"] as const;
/** Every archive a skill can be installed from. */
export const ARCHIVE_SUFFIXES = [...ZIP_SUFFIXES, ...TAR_SUFFIXES] as const;

/** The archive suffix `path` ends with (`.tar.gz`, `.zip`, ...), in any case; null for none. */
export function archiveSuffixOf(path: string): (typeof ARCHIVE_SUFFIXES)[number] | null {
  const lower = path.toLowerCase();
  return ARCHIVE_SUFFIXES.find((suffix) => lower.endsWith(suffix)) ?? null;
}

export function isArchivePath(path: string): boolean {
  return archiveSuffixOf(path) !== null;
}

/**
 * `SkillFile.hash` of a file that is not on disk yet. Saving with it as the base creates the file;
 * when a file appeared there meanwhile, the save is refused as a change on disk.
 */
export const NEW_FILE_HASH = "";
