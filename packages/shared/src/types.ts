import type { AgentCategory, AgentReload } from "./agents";
import type { SkillIssue } from "./skill-checks";

// ── Agents ──

export interface AgentInfo {
  key: string;
  displayName: string;
  category: AgentCategory;
  /** Agent folder found on this machine (custom agents and overridden paths always count). */
  installed: boolean;
  /** Not switched off in Settings. */
  enabled: boolean;
  isCustom: boolean;
  /** Absolute global skills folder. */
  skillsDir: string;
  hasPathOverride: boolean;
  /** Project-relative skills folder, or null when the agent has no project support. */
  projectSkillsDir: string | null;
  hasProjectPathOverride: boolean;
  /** Other agents whose global skills folder is the same directory. */
  sharesDirWith: string[];
  /** Other global folders the agent also loads skills from, absolute, that exist on this machine. */
  alsoReads: string[];
  /** The home folder variable that placed `skillsDir`, when one is set and no override wins. */
  homeEnv: { variable: string; value: string } | null;
  /** When the agent sees skill changes, per its documentation; null when it does not say. */
  reload: AgentReload | null;
  /** Why the agent counts as installed or not, for people wondering about a wrong guess. */
  detection: AgentDetection;
}

/**
 * `folder`: `path` exists (its detect folder). `override`: not found, but a skills folder was
 * chosen in Settings. `custom`: added by the user. `missing`: `path` was looked for and is not
 * there.
 */
export interface AgentDetection {
  reason: "folder" | "override" | "custom" | "missing";
  path: string | null;
}

export interface CustomAgentInput {
  displayName: string;
  skillsDir: string;
  projectSkillsDir?: string | null;
}

// ── Skills ──

/**
 * Where a library skill came from, in the order filters list them. `url` is something on the web
 * that is not a repository: an archive link, a link to a `SKILL.md`, or a skill a site publishes
 * in its well-known index (then `sourceUrl` is the index and `sourceSubpath` the skill's name).
 */
export const SOURCE_TYPES = ["local", "import", "git", "marketplace", "url"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type UpdateStatus =
  | "unknown"
  | "checking"
  | "up_to_date"
  | "update_available"
  | "error"
  | "local_only"
  | "source_missing";

export type DeployMode = "symlink" | "copy";

/** One deployed copy or symlink of a library skill inside an agent's global folder. */
export interface Deployment {
  id: string;
  skillId: string;
  agentKey: string;
  targetPath: string;
  mode: DeployMode;
  syncedAt: number | null;
}

export interface Skill {
  id: string;
  name: string;
  /** Folder name inside the library. */
  dirName: string;
  description: string | null;
  sourceType: SourceType;
  /** Folder path, archive path, git URL, archive link or marketplace id it was installed from. */
  sourceRef: string | null;
  /** Normalised clone URL for git sources. */
  sourceUrl: string | null;
  /** Folder of the skill inside its repository or archive; null when it is the root. */
  sourceSubpath: string | null;
  sourceBranch: string | null;
  /** Revision installed in the library. */
  sourceRevision: string | null;
  /** Latest revision seen upstream. */
  remoteRevision: string | null;
  updateStatus: UpdateStatus;
  lastCheckedAt: number | null;
  lastCheckError: string | null;
  libraryPath: string;
  contentHash: string | null;
  createdAt: number;
  updatedAt: number;
  deployments: Deployment[];
  presetIds: string[];
  tags: string[];
  /** A backup sync found this skill changed on two devices; waiting for the user to choose. */
  hasConflict: boolean;
  /**
   * Files edited in the app since the skill last came from its source, `/` separated. An update
   * asks before replacing them.
   */
  editedFiles: string[];
  /** Problems with the skill's format, errors first. Empty when the skill is fine. */
  issues: SkillIssue[];
  /**
   * Its frontmatter sets `disable-model-invocation: true`: agents that honour the field only run
   * it when a person calls it by name.
   */
  manualOnly: boolean;
  /**
   * The user said they wrote it: no source is looked for. Only ever set on skills without one
   * (see `canLinkSource`).
   */
  authored: boolean;
  /**
   * File patterns (`Cargo.toml`, `*.rs`, `prisma/**`) of projects this skill is suggested for.
   * Kept by Loadout and backed up with the tags, never written into SKILL.md.
   */
  suggestFor: string[];
}

/** A `.zip` written by `skills.exportArchive`. */
export interface ExportResult {
  path: string;
  skillCount: number;
  /** Size of the written file. */
  bytes: number;
}

export interface SkillDocument {
  filename: string;
  content: string;
  /** Top-level file and folder names of the skill. */
  files: string[];
  path: string;
}

export type FileDiffStatus = "added" | "removed" | "modified";
export type FileDiffKind = "text" | "binary" | "too_large" | "permission_only";

export interface FileDiffEntry {
  path: string;
  status: FileDiffStatus;
  kind: FileDiffKind;
  before: string | null;
  after: string | null;
  executableBefore: boolean;
  executableAfter: boolean;
}

/** Library copy compared with the upstream source. `before` is the library, `after` is upstream. */
export interface SourceDiff {
  skillId: string;
  sourceLabel: string;
  revision: string | null;
  entries: FileDiffEntry[];
}

export interface SourceDiffOptions {
  /**
   * Compare with the source as an update would copy it in: a skill kept as `<name>-N` gets its
   * name fixed on the source side too, so that rename alone is not a difference.
   */
  asLibraryCopy?: boolean;
}

export interface SourceDocument {
  filename: string;
  content: string;
  sourceLabel: string;
  revision: string | null;
}

/**
 * A file an update would delete, or an edit it would replace. Nothing is changed until the
 * caller approves the list.
 */
export interface PendingRemoval {
  /** "library" or the agent key whose deployed copy holds the file. */
  location: string;
  path: string;
  /** `edited`: a file changed in the app that the new version replaces. */
  kind: "removed" | "edited";
}

export interface UpdateResult {
  skill: Skill;
  /** False when upstream moved but this skill's folder did not change. */
  contentChanged: boolean;
  /** Non-empty means nothing was changed. Call again with `approval` to proceed. */
  pendingRemovals: PendingRemoval[];
  approval: string | null;
  /** The edited library version this update replaced, kept in Recently removed. */
  removedIds: string[];
}

export interface BatchUpdateResult {
  updated: number;
  unchanged: number;
  /** Names left alone because updating would have removed files. */
  heldBack: string[];
  failed: BatchFailure[];
}

export interface BatchFailure {
  name: string;
  message: string;
}

export interface BatchResult {
  succeeded: number;
  failed: BatchFailure[];
}

/** Skills deleted from the library, each kept in Recently removed under one of `removedIds`. */
export interface RemoveSkillsResult extends BatchResult {
  removedIds: string[];
}

// ── Presets ──

export interface Preset {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  skillIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PresetInput {
  name: string;
  description?: string | null;
  icon?: string | null;
}

/** How much of a preset is deployed across every enabled agent, counted per skill × agent pair. */
export interface PresetDeployStatus {
  presetId: string;
  /** Pairs deployed now. */
  deployed: number;
  /** Pairs the preset wants: its skills × enabled agents, minus the pairs switched off. */
  total: number;
}

export interface PresetAgentToggle {
  agentKey: string;
  displayName: string;
  installed: boolean;
  globallyEnabled: boolean;
  enabled: boolean;
}

export interface TargetConflict {
  path: string;
  reason: string;
}

export interface RenameOptions {
  /** Check the new name and report what would change; change nothing. */
  dryRun?: boolean;
}

/** What renaming a library skill changed (or, for a dry run, would change). */
export interface RenameResult {
  dryRun: boolean;
  from: string;
  to: string;
  /** The skill after the rename; unchanged for a dry run. */
  skill: Skill;
  /** Agents the skill is deployed to, moved to the new folder name. */
  agents: string[];
  /** Links inside project folders re-pointed at the renamed folder. */
  projectLinks: string[];
  /** Real folders in projects with the old name: copies, left as they are. */
  projectCopies: string[];
  /** Agents the skill could not be deployed to again, and why. */
  failed: BatchFailure[];
}

export interface ApplyOptions {
  /** Work out what would change and report it; write nothing. */
  dryRun?: boolean;
}

export interface ApplyResult {
  added: number;
  removed: number;
  skipped: number;
  conflicts: TargetConflict[];
  failed: BatchFailure[];
}

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

export * from "./types-system";
export * from "./types-push";
