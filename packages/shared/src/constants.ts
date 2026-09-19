export const APP_NAME = "Skillboard";
export const APP_ID = "dev.skillboard.app";
/** Folder name under the home directory, and the prefix for anything else we name on disk. */
export const APP_SLUG = "skillboard";
export const LIBRARY_DIR_NAME = `.${APP_SLUG}`;
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

export const MARKETPLACE_NAME = "skills.sh";
export const MARKETPLACE_URL = "https://skills.sh";

/** Name of the bundled skill that teaches agents to drive the CLI. */
export const AGENT_CONTROL_SKILL_NAME = "manage-skills";

export const DEFAULT_BACKUP_REPO_NAME = `${APP_SLUG}-backup`;
export const DEFAULT_BACKUP_COMMIT_MESSAGE = "backup: sync skills library";
export const SNAPSHOT_TAG_PREFIX = "sb-v-";

export const BACKUP_SKILL_LIMIT_BYTES = 100 * 1024 * 1024;
export const BACKUP_REPO_WARN_BYTES = 1024 * 1024 * 1024;

export const SYNC_STATUS_SEVERITY = {
  in_sync: 1,
  local_only: 2,
  library_newer: 3,
  local_newer: 4,
  diverged: 5,
} as const;
