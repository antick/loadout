import type { SecretFinding } from "./secrets";
import type {
  BackupIgnoreRules,
  SyncPreview,
  SyncReviewAnswer,
  SyncSkillDiff,
} from "./types-backup";
import type {
  BackupConflict,
  BackupStatus,
  ConflictResolution,
  DeviceFlowPoll,
  DeviceFlowStart,
  GithubAuthMethod,
  GithubConnectResult,
  MergeSummary,
  SizeReport,
  Snapshot,
  SyncOutcome,
} from "./types";

/** Git backup of the library: remote, sync, snapshots, conflicts and GitHub connect. */
export interface BackupApi {
  status(): Promise<BackupStatus>;
  fetch(): Promise<void>;
  init(): Promise<void>;
  setRemote(url: string): Promise<string>;
  removeRemote(): Promise<void>;
  clone(url: string): Promise<void>;
  reclone(url: string): Promise<void>;
  /**
   * Commit, merge and push. `review`: the answer to a review of this sync; without one, a sync
   * that would delete many skills here stops with `SYNC_MANY_DELETES`.
   */
  sync(message?: string, review?: SyncReviewAnswer): Promise<SyncOutcome>;
  pull(): Promise<MergeSummary>;
  /** Fetch, then work out what a sync would do, without changing the library or the remote. */
  preview(): Promise<SyncPreview>;
  /**
   * The library as a sync would save it now, as an id: equal to a preview's `localTree` while
   * nothing changed. Offline and quiet: no fetch, no progress stages. Null without a repository.
   */
  localTree(): Promise<string | null>;
  /** This computer's version of a skill against the one in `remoteCommit` (from a preview). */
  previewDiff(skillId: string, remoteCommit: string): Promise<SyncSkillDiff>;
  /** This computer's version of a conflicting skill against the other device's. */
  conflictDiff(skillKey: string): Promise<SyncSkillDiff>;
  snapshots(limit?: number): Promise<Snapshot[]>;
  /**
   * The version `id` names (a whole or shortened commit id anywhere in the branch's history),
   * checked as `restore` checks it: refused with the same error. Changes nothing.
   */
  restorePoint(id: string): Promise<Snapshot>;
  /** Returns the safety snapshot taken before restoring. */
  restore(id: string): Promise<string>;
  conflicts(): Promise<BackupConflict[]>;
  resolveConflict(skillKey: string, action: ConflictResolution): Promise<string>;
  /**
   * One choice for several conflicts, behind one safety snapshot (returned). All or nothing;
   * conflicts already resolved are skipped.
   */
  resolveConflicts(skillKeys: string[], action: ConflictResolution): Promise<string>;
  sizeReport(): Promise<SizeReport>;
  /** What stays out of the backup: the app's defaults and the user's own patterns. */
  ignoreRules(): Promise<BackupIgnoreRules>;
  /**
   * Replace the user's own patterns. Refuses patterns that would leave `SKILL.md` or the app's
   * metadata out. Files already in the backup stay in it.
   */
  setIgnoreRules(custom: string[]): Promise<BackupIgnoreRules>;
  /**
   * What the next backup would push that looks like a key or token, and was not allowed yet.
   * Empty without a remote: nothing leaves this computer then.
   */
  secretFindings(): Promise<SecretFinding[]>;
  /** "Back up anyway": stop holding the backup back for these findings (ids from above). */
  allowSecrets(ids: string[]): Promise<void>;
  /**
   * Fold every commit not pushed yet into one holding only today's files, so a key removed from
   * the files leaves the history the next push sends. Refuses while a key is still in the files.
   */
  cleanUpUnpushed(): Promise<void>;
  deviceName(): Promise<string>;
  setDeviceName(name: string): Promise<string>;
  githubConnect(token: string, repoName: string): Promise<GithubConnectResult>;
  githubDeviceStart(): Promise<DeviceFlowStart>;
  githubDevicePoll(deviceCode: string, repoName: string): Promise<DeviceFlowPoll>;
  githubAuthMethod(): Promise<GithubAuthMethod>;
  /**
   * Go ahead with a public repository after `GITHUB_REPO_PUBLIC`. The token waited in memory
   * only, for a few minutes; after that the connect has to start again.
   */
  githubConfirmPublic(confirmId: string): Promise<GithubConnectResult>;
  /** Forget the token of a public-repository connect the user turned down. */
  githubDiscardPublic(confirmId: string): Promise<void>;
  /** True when a GitHub OAuth client id is configured, so device sign-in can be offered. */
  githubDeviceAvailable(): Promise<boolean>;
}
