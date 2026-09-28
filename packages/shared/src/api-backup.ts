import type { SecretFinding } from "./secrets";
import type { BackupIgnoreRules } from "./types-backup";
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
  sync(message?: string): Promise<SyncOutcome>;
  pull(): Promise<MergeSummary>;
  snapshots(limit?: number): Promise<Snapshot[]>;
  createSnapshot(): Promise<string>;
  /** Returns the safety snapshot taken before restoring. */
  restore(tag: string): Promise<string>;
  conflicts(): Promise<BackupConflict[]>;
  resolveConflict(skillKey: string, action: ConflictResolution): Promise<string>;
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
  /** True when a GitHub OAuth client id is configured, so device sign-in can be offered. */
  githubDeviceAvailable(): Promise<boolean>;
}
