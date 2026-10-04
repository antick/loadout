import type {
  BackupConflict,
  BackupIgnoreRules,
  ConflictResolution,
  DeviceFlowPoll,
  DeviceFlowStart,
  GithubConnectResult,
  SyncOutcome,
  SyncPreview,
  SyncReviewAnswer,
} from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { publicRepoDetails, toastBackupError } from "@/lib/backup-errors";
import { toastSyncOutcome } from "@/lib/backup-toast";
import { keys } from "@/lib/query-keys";
import { toastSuccess } from "@/lib/toast";

/**
 * A sync that fails part way can leave a commit or a merge behind, and `data:changed` only follows
 * a finished one: refetch the backup status either way. Without making the mutation wait for it,
 * so the refreshed status cannot unmount the caller before its own callbacks run.
 */
export function refreshAfterSync(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: keys.backup.root });
}

/** Quietly look at the remote so "behind" is current. Failures (offline) are not worth a toast. */
export function useFetchBackup(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.backup.fetch(),
    error: false,
  });
}

export interface StartBackupInput {
  url: string;
  /** `restore`: take what the remote holds. `new`: this machine becomes the first backup. */
  mode: "restore" | "new";
  /** The library already is a repository. */
  isRepo: boolean;
}

export interface StartBackupResult {
  mode: StartBackupInput["mode"];
  outcome: SyncOutcome | null;
}

/** Wire the library to a remote for the first time, either restoring from it or filling it. */
export function useStartBackup(): UseMutationResult<StartBackupResult, unknown, StartBackupInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ url, mode, isRepo }: StartBackupInput) => {
      if (mode === "restore") {
        if (isRepo) await api.backup.setRemote(url);
        else await api.backup.clone(url);
        return { mode, outcome: null };
      }
      if (!isRepo) await api.backup.init();
      await api.backup.setRemote(url);
      return { mode, outcome: await api.backup.sync() };
    },
    onSuccess: ({ outcome }, { isRepo }) => {
      if (outcome) toastSyncOutcome(outcome, t);
      else toastSuccess(t(isRepo ? "backupPage.toast.remoteSaved" : "backupPage.toast.restored"));
    },
    error: false,
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refreshAfterSync(queryClient),
  });
}

/** Save the remote URL. Resolves to the URL as stored, with any credentials taken out. */
export function useSetBackupRemote(): UseMutationResult<string, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (url: string) => api.backup.setRemote(url),
    success: () => t("backupPage.toast.remoteSaved"),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

/** Forget the remote and its stored credentials. Local history and the remote stay untouched. */
export function useRemoveBackupRemote(): UseMutationResult<void, unknown, void> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: () => api.backup.removeRemote(),
    success: () => t("backupPage.toast.disconnected"),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

/** Recovery: download the remote backup again, keeping skills that only exist here. */
export function useRecloneBackup(): UseMutationResult<void, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (url: string) => api.backup.reclone(url),
    success: () => t("backupPage.toast.recloned"),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

/** Switch the library to a snapshot. Toasts the safety snapshot taken just before. */
export function useRestoreSnapshot(): UseMutationResult<string, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (tag: string) => api.backup.restore(tag),
    success: (safetyTag) => ({
      message: t("backupPage.toast.restoredSnapshot"),
      description: t("backupPage.toast.safetySnapshot", { tag: safetyTag }),
    }),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

export interface ResolveConflictInput {
  conflict: BackupConflict;
  action: ConflictResolution;
}

/** Settle one skill that changed on two devices. Toasts the safety snapshot. */
export function useResolveBackupConflict(): UseMutationResult<
  string,
  unknown,
  ResolveConflictInput
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ conflict, action }: ResolveConflictInput) =>
      api.backup.resolveConflict(conflict.skillKey, action),
    success: (safetyTag, { conflict, action }) => ({
      message: t(`backupPage.conflicts.resolved.${action}`, { name: conflict.skillName }),
      description: t("backupPage.toast.safetySnapshot", { tag: safetyTag }),
    }),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

export interface ResolveConflictsInput {
  conflicts: readonly BackupConflict[];
  action: ConflictResolution;
}

/** One choice for several conflicts, behind one safety snapshot. Toasts that snapshot. */
export function useResolveBackupConflicts(): UseMutationResult<
  string,
  unknown,
  ResolveConflictsInput
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ conflicts, action }: ResolveConflictsInput) =>
      api.backup.resolveConflicts(
        conflicts.map((conflict) => conflict.skillKey),
        action,
      ),
    success: (safetyTag, { conflicts, action }) => ({
      message: t(`backupPage.conflicts.resolvedAll.${action}`, { count: conflicts.length }),
      description: t("backupPage.toast.safetySnapshot", { tag: safetyTag }),
    }),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

/** Rename this machine for future backups. */
export function useSetDeviceName(): UseMutationResult<string, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (name: string) => api.backup.setDeviceName(name),
    success: (saved) => t("backupPage.toast.deviceRenamed", { name: saved }),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

export interface GithubTokenInput {
  token: string;
  repoName: string;
}

/** Find or create the backup repository with a personal access token. */
export function useGithubConnect(): UseMutationResult<
  GithubConnectResult,
  unknown,
  GithubTokenInput
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ token, repoName }: GithubTokenInput) => api.backup.githubConnect(token, repoName),
    // The token is part of this mutation's input: drop the finished mutation from the cache at
    // once instead of keeping it for minutes.
    gcTime: 0,
    // A public repository is not a failure: the caller asks the user about it.
    error: false,
    onError: (error) => (publicRepoDetails(error) ? undefined : toastBackupError(error, t)),
  });
}

/** Begin "Sign in with GitHub": resolves to the code the user types on github.com. */
export function useGithubDeviceStart(): UseMutationResult<DeviceFlowStart, unknown, void> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: () => api.backup.githubDeviceStart(),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

export interface DevicePollInput {
  deviceCode: string;
  repoName: string;
}

/** One poll of a running sign-in. The caller owns the timing and the error handling. */
export function useGithubDevicePoll(): UseMutationResult<DeviceFlowPoll, unknown, DevicePollInput> {
  return useApiMutation({
    fn: ({ deviceCode, repoName }: DevicePollInput) =>
      api.backup.githubDevicePoll(deviceCode, repoName),
    error: false,
  });
}

/** Clone a backup into an empty library (first run). Errors are shown by the caller, inline. */
export function useRestoreFromRemote(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (url: string) => api.backup.clone(url),
    error: false,
  });
}

/** "Back up anyway": allow these findings, then back up right away. */
export function useAllowSecretsAndSync(): UseMutationResult<SyncOutcome, unknown, string[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (ids: string[]) => {
      await api.backup.allowSecrets(ids);
      return api.backup.sync();
    },
    onSuccess: (outcome) => toastSyncOutcome(outcome, t),
    error: false,
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refreshAfterSync(queryClient),
  });
}

/** Fold unpushed commits into today's files (a removed key leaves the history), then back up. */
export function useCleanUpAndSync(): UseMutationResult<SyncOutcome, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: async () => {
      await api.backup.cleanUpUnpushed();
      return api.backup.sync();
    },
    onSuccess: (outcome) => toastSyncOutcome(outcome, t),
    error: false,
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refreshAfterSync(queryClient),
  });
}

/** Replace the user's own "leave out of the backup" patterns. Errors are shown by the caller. */
export function useSetBackupIgnoreRules(): UseMutationResult<BackupIgnoreRules, unknown, string[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: (custom: string[]) => api.backup.setIgnoreRules(custom),
    error: false,
    onSuccess: (rules) => {
      queryClient.setQueryData(keys.backup.ignore, rules);
      toastSuccess(t("backupSync.ignore.saved"));
    },
  });
}

/** Fetch and work out what a sync would do. Errors are shown by the caller. */
export function usePreviewSync(): UseMutationResult<SyncPreview, unknown, void> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: () => api.backup.preview(),
    error: false,
    // The fetch moved the remote-tracking branch: "behind" may have changed.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.backup.status }),
  });
}

/** Sync, with the answer to a review when there was one. Toasts what happened. */
export function useReviewedSync(): UseMutationResult<
  SyncOutcome,
  unknown,
  SyncReviewAnswer | undefined
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: (review) => api.backup.sync(undefined, review),
    error: false,
    onSuccess: (outcome) => toastSyncOutcome(outcome, t),
    onSettled: () => refreshAfterSync(queryClient),
  });
}

/** Connect to a public GitHub repository after all, once the user agreed. */
export function useGithubConfirmPublic(): UseMutationResult<GithubConnectResult, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (confirmId: string) => api.backup.githubConfirmPublic(confirmId),
    error: false,
    onError: (error) => toastBackupError(error, t),
  });
}

/** Forget a public-repository connect the user turned down. */
export function useGithubDiscardPublic(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (confirmId: string) => api.backup.githubDiscardPublic(confirmId),
    error: false,
  });
}
