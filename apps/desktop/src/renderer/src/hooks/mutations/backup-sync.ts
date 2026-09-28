import type {
  BackupIgnoreRules,
  SyncOutcome,
  SyncPreview,
  SyncReviewAnswer,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateAfterBackup } from "@/hooks/mutations/backup-page";
import { api } from "@/lib/api";
import { toastSyncOutcome } from "@/lib/backup-toast";
import { keys } from "@/lib/query-keys";
import { toastSuccess } from "@/lib/toast";

/** Replace the user's own "leave out of the backup" patterns. Errors are shown by the caller. */
export function useSetBackupIgnoreRules(): UseMutationResult<BackupIgnoreRules, unknown, string[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (custom: string[]) => api.backup.setIgnoreRules(custom),
    onSuccess: (rules) => {
      queryClient.setQueryData(keys.backup.ignore, rules);
      toastSuccess(t("backupSync.ignore.saved"));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.backup.status }),
  });
}

/** Fetch and work out what a sync would do. Errors are shown by the caller. */
export function usePreviewSync(): UseMutationResult<SyncPreview, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.backup.preview(),
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
  return useMutation({
    mutationFn: (review) => api.backup.sync(undefined, review),
    onSuccess: (outcome) => toastSyncOutcome(outcome, t),
    onSettled: () => invalidateAfterBackup(queryClient),
  });
}
