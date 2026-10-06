/** Backup and system types. Split from `types.ts` to keep both files small. */

// ── Backup ──

export type UpstreamHealth =
  | "healthy"
  | "no_remote"
  | "no_upstream"
  | "unrelated_histories"
  | "detached";

export interface BackupStatus {
  isRepo: boolean;
  remoteUrl: string | null;
  branch: string | null;
  hasChanges: boolean;
  changedSkillCount: number;
  ahead: number;
  behind: number;
  lastCommit: string | null;
  lastCommitAt: number | null;
  /** The restore point the library is at: `Snapshot.id` of its commit. */
  currentSnapshot: string | null;
  restoredFrom: string | null;
  upstreamHealth: UpstreamHealth;
  gitAvailable: boolean;
  /** A newer app version has written to this backup: this computer should update. */
  newerAppVersion: string | null;
  /** Why the last automatic backup failed; null once one succeeds. */
  lastAutoError: string | null;
  /** The first-run question (start fresh or restore) was answered on this computer. */
  firstRunAnswered: boolean;
}

/** A restore point: one commit of the backup branch. */
export interface Snapshot {
  /** Its id, to restore it by: the commit, shortened (12 hex digits, more only when needed). */
  id: string;
  message: string;
  createdAt: number;
  /** Device that made the backup. */
  device: string;
}

export interface MergedSkill {
  name: string;
  fromDevice: string;
}

export interface MergeSummary {
  upToDate: boolean;
  updated: MergedSkill[];
  keptLocal: string[];
  /** Deleted on another device and taken out here; each waits in Recently removed. */
  removed: MergedSkill[];
  newConflicts: string[];
}

export interface SyncOutcome {
  committed: boolean;
  merge: MergeSummary | null;
  pushed: boolean;
  snapshot: string | null;
}

export interface BackupConflict {
  skillKey: string;
  skillName: string;
  theirsCommit: string;
  theirsPath: string | null;
  detectedAt: number;
}

export type ConflictResolution = "keep_local" | "use_remote" | "keep_both";

export interface OversizedSkill {
  name: string;
  bytes: number;
  /** Over the per-skill limit and kept out of the backup. */
  excluded: boolean;
}

export interface SizeReport {
  totalBytes: number;
  oversized: OversizedSkill[];
  skillLimitBytes: number;
  repoWarnBytes: number;
}

export interface GithubConnectResult {
  url: string;
  login: string;
  repoCreated: boolean;
  remoteHasContent: boolean;
}

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceFlowPoll {
  status: "pending" | "slow_down" | "connected";
  result: GithubConnectResult | null;
}

export type GithubAuthMethod = "oauth" | "pat" | null;

export interface AutoBackupEvent {
  ok: boolean;
  /** Changes are still waiting, for example conflicts or an offline remote. */
  pending: boolean;
  error: string | null;
}

// ── System ──

export type ActivityKind =
  | "install"
  | "create"
  | "rename"
  | "scan"
  | "remove"
  | "edit"
  | "update"
  | "deploy"
  | "undeploy"
  | "import"
  | "backup"
  | "restore"
  | "preset"
  | "export"
  | "publish";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Skill, preset or project name the entry is about. */
  subject: string;
  detail: string | null;
  ok: boolean;
  at: number;
}

/** Where the app-update flow stands. */
export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

/**
 * How this copy of the app takes an update: `replace` swaps the app in place and restarts it
 * (macOS, AppImage), `installer` runs the downloaded installer and restarts (Windows), `package`
 * opens the downloaded package in the system installer (Linux .deb).
 */
export type AppUpdateMethod = "replace" | "installer" | "package";

/** Why this copy cannot update itself. The release page is offered instead. */
export type AppUpdateBlocker =
  /** A development build: it has no feed to check. */
  | "not_configured"
  /** A development build: it checks, but never replaces itself. */
  | "development"
  /** macOS runs the app from a temporary copy because it was opened where it was downloaded. */
  | "translocated"
  /** Running straight from the mounted disk image. */
  | "disk_image"
  /** The app's folder cannot be written by this user. */
  | "read_only"
  /** The release has no build for this system. */
  | "no_build";

/** A development build: nothing about updates is worth telling its user. */
export function isDevelopmentBuild(blocker: AppUpdateBlocker | null | undefined): boolean {
  return blocker === "not_configured" || blocker === "development";
}

export interface AppUpdateStatus {
  phase: AppUpdatePhase;
  currentVersion: string;
  /** Newest published version, once a check found one. */
  latestVersion: string | null;
  /** Release page of `latestVersion`, or the releases list. */
  releaseUrl: string;
  method: AppUpdateMethod;
  blocker: AppUpdateBlocker | null;
  /** Bytes received and expected while downloading. */
  progress: { received: number; total: number } | null;
  /** Last check, as a timestamp. */
  checkedAt: number | null;
  error: string | null;
  /** The previous run started an update: whether it arrived. Reported once. */
  lastInstall: { version: string; ok: boolean; at: number } | null;
}

export interface DiagnosticInfo {
  appVersion: string;
  os: string;
  osVersion: string;
  arch: string;
  libraryPath: string;
  libraryPathOverridden: boolean;
  gitVersion: string | null;
  /**
   * Where a GitHub token this computer already has comes from (`GITHUB_TOKEN`, `GH_TOKEN` or the
   * GitHub CLI's sign-in), or null. Git uses it for github.com when nothing else answers.
   */
  githubSignIn: GitHubSignInOrigin | null;
}

export type GitHubSignInOrigin = "GITHUB_TOKEN" | "GH_TOKEN" | "gh";

export interface LogExcerpt {
  logPath: string;
  excerpt: string;
  lineCount: number;
  hasWarnings: boolean;
}

export interface LogExport {
  zipPath: string;
  fileCount: number;
}

export interface CrashInfo {
  at: number;
  message: string;
}

/** A recorded deployment the start-up repair put back. */
export interface RepairedDeployment {
  skill: string;
  agentKey: string;
  /** The agent's display name. */
  agent: string;
  path: string;
}

export interface RepairFailure extends RepairedDeployment {
  /** Why it could not be put back, for people. */
  message: string;
}

/** What the deployment repair found and did (`SystemApi.repairReport`). */
export interface RepairReport {
  ranAt: number;
  /** Deployments looked at: those of agents that are installed and switched on. */
  checked: number;
  repaired: RepairedDeployment[];
  /**
   * Deployments whose place now holds something Loadout did not put there: left alone, never
   * overwritten, and not counted as failures. `doctor` reports them.
   */
  notOurs: RepairedDeployment[];
  failed: RepairFailure[];
  /** Deployments of agents not installed or switched off, left alone. */
  skippedAgents: number;
}

export type LibraryWarning = "config_unreadable" | "library_path_invalid" | "migration_incomplete";

export interface LibraryLocation {
  path: string;
  defaultPath: string;
  overridden: boolean;
  /** A different path takes effect after a restart. */
  pendingPath: string | null;
  warnings: LibraryWarning[];
}

export interface CliStatus {
  published: boolean;
  path: string;
  version: string | null;
}

export interface AgentControlStatus {
  /** The bundled management skill is in the library. */
  installed: boolean;
  skillId: string | null;
  dismissed: boolean;
}

export type Platform = "darwin" | "win32" | "linux";

export interface AppInfo {
  name: string;
  version: string;
  platform: Platform;
  homeDir: string;
}

// ── Project suggestions ──

/** Where a suggested project was seen: an agent's or editor's history, or a Git repository. */
export const PROJECT_SUGGESTION_SOURCES = [
  "claude_code",
  "cursor",
  "vscode",
  "windsurf",
  "git",
] as const;
export type ProjectSuggestionSource = (typeof PROJECT_SUGGESTION_SOURCES)[number];

/** A folder that looks like a project the user works in and that is not linked yet. */
export interface ProjectSuggestion {
  path: string;
  name: string;
  sources: ProjectSuggestionSource[];
  /** Last sign of work in it (a session, a Git change); null when unknown. */
  lastActiveAt: number | null;
  /** Agent skills folders it already has, project-relative. Empty for folders not looked inside. */
  skillFolders: string[];
  /**
   * In a folder macOS guards (Desktop, Documents, Downloads, iCloud, external drives). It was not
   * opened, so nothing is known about its content until the user adds it.
   */
  guarded: boolean;
}
