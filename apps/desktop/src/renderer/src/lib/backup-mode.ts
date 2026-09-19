import type { BackupStatus } from "@skillboard/shared";

export type FixReason = "unrelated_histories" | "detached";
/** Where the waiting changes are: on this machine, on the remote, or both. */
export type PendingSide = "local" | "remote" | "both";

export type BackupMode =
  | { kind: "loading" }
  | { kind: "git_missing" }
  | { kind: "not_set_up"; savedRemote: string | null }
  | { kind: "needs_remote"; savedRemote: string | null }
  | { kind: "needs_fix"; reason: FixReason }
  | { kind: "failed" }
  | { kind: "pending"; side: PendingSide }
  | { kind: "up_to_date" };

export type BackupModeKind = BackupMode["kind"];

/**
 * What the Backup page should show and offer, from the repository status alone.
 * `savedRemote` is a URL the user already gave that is not wired into a repository yet;
 * `lastError` is the failure of the most recent action, cleared by the next success.
 */
export function deriveBackupMode(
  status: BackupStatus | undefined,
  savedRemote: string | null,
  lastError: unknown,
): BackupMode {
  if (!status) return { kind: "loading" };
  if (!status.gitAvailable) return { kind: "git_missing" };
  const remote = status.remoteUrl ?? savedRemote;
  if (!status.isRepo) return { kind: "not_set_up", savedRemote: remote };
  if (status.upstreamHealth === "no_remote") return { kind: "needs_remote", savedRemote: remote };
  if (status.upstreamHealth === "unrelated_histories" || status.upstreamHealth === "detached") {
    return { kind: "needs_fix", reason: status.upstreamHealth };
  }
  if (lastError) return { kind: "failed" };

  const local = status.hasChanges || status.ahead > 0 || status.upstreamHealth === "no_upstream";
  const remoteAhead = status.behind > 0;
  if (local && remoteAhead) return { kind: "pending", side: "both" };
  if (local) return { kind: "pending", side: "local" };
  if (remoteAhead) return { kind: "pending", side: "remote" };
  return { kind: "up_to_date" };
}
