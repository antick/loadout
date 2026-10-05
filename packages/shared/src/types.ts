import type { AgentCategory, AgentReload } from "./agents";
import type { SkillIssue } from "./skill-checks";
import type { SkillBehaviorField } from "./agent-skill-fields";
import type { SkillTrait } from "./skill-traits";
import type { InstallOptions } from "./safety";

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
 * Where a library skill came from, in the order filters list them. `marketplace` is a GitHub
 * repository found on skills.sh; `clawhub` a versioned skill on the ClawHub registry (`sourceRef`
 * is `owner/slug`, `sourceRevision` the version). `url` is something on the web that is not a
 * repository: an archive link, a link to a `SKILL.md`, or a skill a site publishes in its
 * well-known index (then `sourceUrl` is the index and `sourceSubpath` the skill's name).
 */
export const SOURCE_TYPES = ["local", "import", "git", "marketplace", "clawhub", "url"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type UpdateStatus =
  | "unknown"
  | "up_to_date"
  | "update_available"
  | "error"
  | "local_only"
  | "source_missing";

export const DEPLOY_MODES = ["symlink", "copy"] as const;
export type DeployMode = (typeof DEPLOY_MODES)[number];

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
  /**
   * A link's download moved to another site and the user agreed to it at install: that host.
   * Updates follow the link there, and to no other site.
   */
  sourceTrustedHost: string | null;
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
   * What the skill can make an agent do beyond reading it: run files it ships, register hooks,
   * start MCP servers, use tools without asking. Information, not a verdict.
   */
  traits: SkillTrait[];
  /**
   * Frontmatter fields it uses that some agents skip (`allowed-tools`, `model`, `hooks`...).
   * `fieldNotesFor(skill.behaviorFields, agentKey)` says which agents do not act on them.
   */
  behaviorFields: SkillBehaviorField[];
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
  /**
   * Keys of agents this skill must never be deployed to. Kept by Loadout and backed up with the
   * tags. Deploying skips these; one already deployed there is removed when the block is set.
   */
  blockedAgents: string[];
  /**
   * The user's own note on the skill: why it is here, when to use it. Kept by Loadout and backed
   * up with the tags, never written into SKILL.md. Null when there is none.
   */
  note: string | null;
  /**
   * When the user made the skill a favourite (epoch ms), null when it is not one. Kept by
   * Loadout and backed up with the tags.
   */
  favoritedAt: number | null;
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
  /**
   * A dry run's comparison of the source with the library copy, as an update would copy it in
   * (`asLibraryCopy`), from the same fetch. Null when not a dry run.
   */
  sourceDiff: SourceDiff | null;
}

/** Options of an update from the source, or a re-import of a folder or archive. */
export interface RefreshOptions extends InstallOptions {
  /**
   * Fetch the new version and say what it would hold back (`pendingRemovals`), by the same rule
   * a real update uses, but write nothing: not the files, not the row.
   */
  dryRun?: boolean;
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
  /** Per member skill, the agents its switch is off for; skills with every switch on are left out. */
  switchedOff: Record<string, string[]>;
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
  /**
   * When adding: leave out the pairs whose target may not be replaced and apply the rest. They
   * are still listed in `conflicts`. Without it, one such pair stops the whole request.
   */
  skipConflicts?: boolean;
}

export interface PresetApplyOptions extends ApplyOptions {
  /** Only these agents (each still honouring the preset's switches); every enabled one if absent. */
  agentKeys?: string[];
}

export interface PresetRemoveOptions extends ApplyOptions {
  /** Only these agents, switches aside; otherwise as `everyHolder` says. */
  agentKeys?: string[];
  /**
   * Take the skills out of every agent that holds one, switches aside (the CLI's default).
   * Otherwise the switched-on agents only, undoing exactly what `applyToDefault` put there.
   */
  everyHolder?: boolean;
}

export interface UndeployResult {
  /** Copies edited in the agent's folder that the removal sets aside (with `dryRun`: would). */
  editedCopies: string[];
  /** Their Recently removed entries, to restore for an undo. Empty on a dry run. */
  removedIds: string[];
}

export interface ApplyResult {
  added: number;
  removed: number;
  skipped: number;
  /** Pairs left out because the skill is blocked for that agent (`Skill.blockedAgents`). */
  blocked: number;
  conflicts: TargetConflict[];
  failed: BatchFailure[];
}

export * from "./types-system";
export * from "./types-push";
export * from "./types-workspace";
