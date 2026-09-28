/**
 * A project's skills file: `skills.toml` says which skills from which sources the project uses
 * and which agents get them; `skills-lock.json` next to it records the exact commit of every
 * source and a fingerprint of every folder written, so every checkout gets identical files and
 * only folders Loadout wrote are ever replaced or removed. Both are meant to be committed.
 */

export const SKILLS_FILE_NAME = "skills.toml";
export const SKILLS_LOCK_NAME = "skills-lock.json";

export interface SkillsFileSource {
  /** A Git URL, `owner/repo`, or a link to a folder inside a repository. */
  url: string;
  /** Branch or tag to follow; null follows the default branch. */
  ref: string | null;
  /** Skill names (or folder names) to take; null takes every skill the source has. */
  skills: string[] | null;
}

export interface SkillsFileSpec {
  /** Agent keys whose project folders get the skills. */
  agents: string[];
  /** Add the written folders to a marked block in `.gitignore`. */
  gitignore: boolean;
  sources: SkillsFileSource[];
}

/** A source as the lock pins it. */
export interface LockedSource {
  url: string;
  ref: string | null;
  revision: string;
}

/** A folder `apply` wrote, and what it held then. */
export interface LockedFolder {
  /** Project-relative folder, `/` separated, e.g. `.claude/skills/pdf`. */
  folder: string;
  url: string;
  /** The skill's folder inside its source. */
  skillPath: string;
  hash: string;
}

export interface SkillsLock {
  version: number;
  sources: LockedSource[];
  folders: LockedFolder[];
}

/** A skills file found for a folder. */
export interface SkillsFileInfo {
  /** The project folder: where `skills.toml` is. */
  root: string;
  path: string;
  spec: SkillsFileSpec;
  lockPath: string;
  /** Null until the first apply. */
  lock: SkillsLock | null;
}

/**
 * What applying does to one project folder:
 * - `add`: nothing there yet.
 * - `update`: Loadout wrote it and nobody changed it since; the source has something newer.
 * - `same`: already exactly what the file asks for.
 * - `edited`: something else is there (changed by hand, or never written by Loadout). Kept
 *   unless forced; forcing puts it in Recently removed first.
 * - `remove`: Loadout wrote it, nobody changed it, and the file no longer asks for it.
 * - `keep_edited`: no longer asked for, but changed since Loadout wrote it. Kept unless forced.
 */
export type SkillsFileAction = "add" | "update" | "same" | "edited" | "remove" | "keep_edited";

export interface SkillsFileEntry {
  folder: string;
  skill: string;
  /** The source it comes from; for a removal, the source it came from. */
  url: string;
  /** Agents that read the folder. */
  agents: string[];
  action: SkillsFileAction;
}

export interface SkillsFilePlanSource {
  url: string;
  ref: string | null;
  /** The commit the files come from. */
  revision: string;
  /** The lock pinned another commit (or none): applying moves the pin. */
  moved: boolean;
  /** Skills the file names that the source does not have. */
  missing: string[];
}

export interface SkillsFilePlan {
  root: string;
  sources: SkillsFilePlanSource[];
  entries: SkillsFileEntry[];
  /** Agent keys in the file that match no agent on this computer; they get nothing. */
  unknownAgents: string[];
}

export interface SkillsFileApplyOptions {
  /** Follow each source's branch or tag to its newest commit instead of the locked one. */
  update?: boolean;
  /** Replace or remove folders changed by hand; they go to Recently removed first. */
  force?: boolean;
  /** Also remove folders the file no longer asks for. */
  prune?: boolean;
}

export interface SkillsFileResult {
  plan: SkillsFilePlan;
  written: number;
  removed: number;
  /** Folders left alone because they were changed by hand. */
  kept: string[];
}

/** What `skills.toml` gets when it is made from a project's current skills. */
export interface SkillsFileInit {
  agents: string[];
  sources: SkillsFileSource[];
}
