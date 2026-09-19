import type {
  BackupConflict,
  ConflictResolution,
  DeviceFlowPoll,
  DeviceFlowStart,
  GithubConnectResult,
  SyncOutcome,
} from "@skillboard/shared";
import {
  type QueryClient,
  type QueryKey,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { toastBackupError } from "@/lib/backup-errors";
import { toastSyncOutcome } from "@/lib/backup-toast";
import { keys } from "@/lib/query-keys";
import { toastSuccess } from "@/lib/toast";

/** A backup action can rewrite the whole library, so everything built from it is refetched. */
function invalidateAfterBackup(queryClient: QueryClient): void {
  for (const queryKey of [keys.backup.root, keys.skills.root, keys.presets.root]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Refetch without making the mutation wait for it. A hook-level callback that returns a promise
 * holds back the per-call `onSuccess`; by then the refreshed status may already have unmounted the
 * caller (the Disconnect card, the remote form) and its callback would be dropped.
 */
function refresh(queryClient: QueryClient, queryKey: QueryKey): void {
  void queryClient.invalidateQueries({ queryKey });
}

/** Commit, merge what other devices pushed, and push. Toasts what happened. */
export function useSyncBackup(): UseMutationResult<SyncOutcome, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.backup.sync(),
    onSuccess: (outcome) => toastSyncOutcome(outcome, t),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => invalidateAfterBackup(queryClient),
  });
}

/** Quietly look at the remote so "behind" is current. Failures (offline) are not worth a toast. */
export function useFetchBackup(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.backup.fetch(),
    onSettled: () => refresh(queryClient, keys.backup.status),
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
  return useMutation({
    mutationFn: async ({ url, mode, isRepo }: StartBackupInput) => {
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
    onError: (error) => toastBackupError(error, t),
    onSettled: () => invalidateAfterBackup(queryClient),
  });
}

/** Save the remote URL. Resolves to the URL as stored, with any credentials taken out. */
export function useSetBackupRemote(): UseMutationResult<string, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (url: string) => api.backup.setRemote(url),
    onSuccess: () => toastSuccess(t("backupPage.toast.remoteSaved")),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refresh(queryClient, keys.backup.root),
  });
}

/** Forget the remote and its stored credentials. Local history and the remote stay untouched. */
export function useRemoveBackupRemote(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.backup.removeRemote(),
    onSuccess: () => toastSuccess(t("backupPage.toast.disconnected")),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refresh(queryClient, keys.backup.root),
  });
}

/** Recovery: download the remote backup again, keeping skills that only exist here. */
export function useRecloneBackup(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (url: string) => api.backup.reclone(url),
    onSuccess: () => toastSuccess(t("backupPage.toast.recloned")),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => invalidateAfterBackup(queryClient),
  });
}

/** Switch the library to a snapshot. Toasts the safety snapshot taken just before. */
export function useRestoreSnapshot(): UseMutationResult<string, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (tag: string) => api.backup.restore(tag),
    onSuccess: (safetyTag) =>
      toastSuccess(
        t("backupPage.toast.restoredSnapshot"),
        t("backupPage.toast.safetySnapshot", { tag: safetyTag }),
      ),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => invalidateAfterBackup(queryClient),
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ conflict, action }: ResolveConflictInput) =>
      api.backup.resolveConflict(conflict.skillKey, action),
    onSuccess: (safetyTag, { conflict, action }) =>
      toastSuccess(
        t(`backupPage.conflicts.resolved.${action}`, { name: conflict.skillName }),
        t("backupPage.toast.safetySnapshot", { tag: safetyTag }),
      ),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => invalidateAfterBackup(queryClient),
  });
}

/** Rename this machine for future backups. */
export function useSetDeviceName(): UseMutationResult<string, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (name: string) => api.backup.setDeviceName(name),
    onSuccess: (saved) => toastSuccess(t("backupPage.toast.deviceRenamed", { name: saved })),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refresh(queryClient, keys.backup.device),
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ token, repoName }: GithubTokenInput) =>
      api.backup.githubConnect(token, repoName),
    onError: (error) => toastBackupError(error, t),
    onSettled: () => refresh(queryClient, keys.backup.root),
  });
}

/** Begin "Sign in with GitHub": resolves to the code the user types on github.com. */
export function useGithubDeviceStart(): UseMutationResult<DeviceFlowStart, unknown, void> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.backup.githubDeviceStart(),
    onError: (error) => toastBackupError(error, t),
  });
}

export interface DevicePollInput {
  deviceCode: string;
  repoName: string;
}

/** One poll of a running sign-in. The caller owns the timing and the error handling. */
export function useGithubDevicePoll(): UseMutationResult<DeviceFlowPoll, unknown, DevicePollInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceCode, repoName }: DevicePollInput) =>
      api.backup.githubDevicePoll(deviceCode, repoName),
    onSuccess: (poll) => {
      if (poll.status === "connected")
        void queryClient.invalidateQueries({ queryKey: keys.backup.root });
    },
  });
}

/** Clone a backup into an empty library (first run). Errors are shown by the caller, inline. */
export function useRestoreFromRemote(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.backup.clone(url),
    onSettled: () => invalidateAfterBackup(queryClient),
  });
}
