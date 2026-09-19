import type { AgentCategory } from "./agents";

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
}

export interface CustomAgentInput {
  displayName: string;
  skillsDir: string;
  projectSkillsDir?: string | null;
}

// ── Skills ──

/** Where a library skill came from. */
export type SourceType = "local" | "import" | "git" | "marketplace";

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
  /** Folder path, archive path, git URL or marketplace id the skill was installed from. */
  sourceRef: string | null;
  /** Normalised clone URL for git sources. */
  sourceUrl: string | null;
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

export interface SourceDocument {
  filename: string;
  content: string;
  sourceLabel: string;
  revision: string | null;
}

/** A file an update would delete. Nothing is changed until the caller approves the list. */
export interface PendingRemoval {
  /** "library" or the agent key whose deployed copy holds the file. */
  location: string;
  path: string;
}

export interface UpdateResult {
  skill: Skill;
  /** False when upstream moved but this skill's folder did not change. */
  contentChanged: boolean;
  /** Non-empty means nothing was changed. Call again with `approval` to proceed. */
  pendingRemovals: PendingRemoval[];
  approval: string | null;
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

// ── Install ──

export interface RepoSkillPreview {
  /** Path relative to the scanned root, `/` separated. Stable key. */
  relPath: string;
  name: string;
  description: string | null;
  /** A library skill with this name already exists; installing updates it. */
  alreadyInstalled: boolean;
}

export interface GitPreview {
  /** Handle for confirm / cancel. */
  previewId: string;
  repoUrl: string;
  branch: string | null;
  revision: string | null;
  skills: RepoSkillPreview[];
}

export interface InstallSelection {
  relPath: string;
  name: string;
}

export type InstallPhase = "cloning" | "scanning" | "installing" | "deploying" | "done";

export interface InstallProgress {
  /** Caller-chosen key, also used to cancel. */
  key: string;
  phase: InstallPhase;
  current?: number;
  total?: number;
  name?: string;
}

export interface BatchImportResult {
  imported: number;
  skipped: number;
  errors: BatchFailure[];
}

export interface DiscoveredLocation {
  agentKey: string;
  path: string;
}

/** Skills found in agent folders, grouped when several folders hold the same content. */
export interface DiscoveredSkill {
  name: string;
  description: string | null;
  fingerprint: string;
  locations: DiscoveredLocation[];
  imported: boolean;
}

export interface ScanResult {
  agentsScanned: number;
  skillsFound: number;
  skills: DiscoveredSkill[];
}

export type MarketBoard = "hot" | "trending" | "all_time";

export interface MarketSkill {
  /** `owner/repo/skill`. */
  id: string;
  skillId: string;
  name: string;
  /** `owner/repo`. */
  source: string;
  installs: number;
  installed: boolean;
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
  /** Skillboard deployed this copy (global workspace only). */
  managed: boolean;
  syncStatus: SyncStatus;
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
  createdAt: number;
  updatedAt: number;
}

/** A project-level deploy target. Agents sharing one project folder are merged into one target. */
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

export interface PushToLibraryResult {
  /** Several copies may each hold unique content, so nothing was written. */
  conflictingVariants: number;
  /** Copies that could not be realigned to the library after the push. */
  realignFailed: number;
}

export * from "./types-system";
