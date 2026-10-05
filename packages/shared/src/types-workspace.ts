// ── Workspaces ──

/** How a skill folder on disk compares with its library skill. */
export type SyncStatus = "local_only" | "in_sync" | "local_newer" | "library_newer" | "diverged";

/** A skill folder found in an agent's global folder or in a project. */
/** Another copy of a skill that the same agent also loads, so it may see the skill twice. */
export interface SkillDuplicate {
  /**
   * `shared_folder`: a folder the agent reads besides its own, such as `~/.agents/skills`.
   * `global`: the agent's global skills folder, for a skill that is also in a project.
   * `plugin`: a switched-on plugin of the agent brings a skill of the same name.
   */
  where: "shared_folder" | "global" | "plugin";
  agentKey: string;
  agentDisplayName: string;
  /** The other copy's folder. */
  path: string;
  /** For `plugin`: the plugin's name. */
  plugin?: string;
}

/**
 * A skill that comes with one of an agent's plugins (Claude Code's plugin manager). The agent
 * loads it next to the skills in its folder; the plugin manager owns it, so it is shown only.
 */
export interface PluginSkill {
  name: string;
  description: string | null;
  /** The skill's folder inside the plugin manager's cache. */
  path: string;
  /** The plugin's name, e.g. `frontend-design`. */
  plugin: string;
  /** The marketplace it was installed from, e.g. `claude-plugins-official`; null when unknown. */
  marketplace: string | null;
  version: string | null;
  /** The plugin is switched on, so the agent loads its skills. */
  enabled: boolean;
}

export interface LocalSkill {
  name: string;
  dirName: string;
  /** Path relative to the scanned skills root, `/` separated. */
  relativePath: string;
  description: string | null;
  path: string;
  files: string[];
  enabled: boolean;
  agentKey: string;
  agentDisplayName: string;
  tags: string[];
  librarySkillId: string | null;
  /** Loadout deployed this copy (global workspace only). */
  managed: boolean;
  /**
   * Where the folder really is when it is a link (a symlink, or a junction on Windows): edits
   * made at either end are the same edit. Null for a plain folder, a copy.
   */
  linkTarget: string | null;
  syncStatus: SyncStatus;
  /** Other copies the same agent loads; empty when this is the only one. */
  duplicates: SkillDuplicate[];
}

/**
 * Why a folder in a skills root is not a skill the agent can load. `missing_document`: no
 * `SKILL.md` in it (or, where the agent looks through namespace folders, anywhere below it).
 * `dangling_link`: a link whose target no longer exists.
 */
export type BrokenSkillReason = "missing_document" | "dangling_link";

/** A folder in an agent's skills folder that the agent ignores. */
export interface BrokenSkillFolder {
  dirName: string;
  /** Path relative to the scanned skills root, `/` separated. */
  relativePath: string;
  path: string;
  reason: BrokenSkillReason;
  /** Where the link points (it may not exist). Null for a plain folder. */
  linkTarget: string | null;
  /** Top-level entries, folders ending in `/`. Empty for a dangling link. */
  files: string[];
  /** The app deployed something at this path; it is repaired from the library, not deleted here. */
  managed: boolean;
}

export type WorkspaceType = "project" | "linked";

export type SyncHealth = Record<SyncStatus, number>;

export interface Project {
  id: string;
  name: string;
  path: string;
  type: WorkspaceType;
  supportsToggle: boolean;
  sortOrder: number;
  skillCount: number;
  syncHealth: SyncHealth;
  /** The folder no longer exists on disk. */
  missing: boolean;
  /** Pinned to the top of the sidebar on this computer. */
  pinned: boolean;
  /** Times it was opened here in the last 30 days (a visit counts once). */
  recentOpens: number;
  lastOpenedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** A project-level deploy target. Agents sharing one project folder are merged into one target. */
/** One agent's copy of a project skill: what the project editor opens. */
export interface ProjectCopyRef {
  /** The skill folder, relative to the agent's skills folder inside the project. */
  relativePath: string;
  agentKey: string;
}

export interface ProjectTarget {
  key: string;
  displayName: string;
  /** Every agent key that resolves to this folder. */
  agentKeys: string[];
  relativeDir: string;
  enabled: boolean;
  installed: boolean;
  isCustom: boolean;
}
