import type { BackupIgnoreRules } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
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
