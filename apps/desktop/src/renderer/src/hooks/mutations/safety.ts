import {
  SAFETY_SCAN_LIBRARY_KEY,
  type SafetyRecord,
  type SafetyScanSummary,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useInstallTask } from "@/features/install/use-install-task";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Scan one library skill now. */
export function useScanSkill(): UseMutationResult<SafetyRecord, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (skillId: string) => api.safety.scanSkill(skillId),
    onSuccess: (record) => toastSuccess(t(`safety.scanned.${record.verdict}`)),
    onError: (error) => toastError(error, "safety.errors.scan"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.safety.root }),
  });
}

/**
 * Scan the library with a progress toast ("Safety check 3/20: name"). Skills whose report still
 * holds are skipped unless `force`.
 */
export function useScanLibrary(): (force?: boolean) => Promise<SafetyScanSummary | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  return useCallback(
    (force = false) =>
      run({
        key: SAFETY_SCAN_LIBRARY_KEY,
        title: t("safety.library.running"),
        run: () => api.safety.scanLibrary(force),
        success: (summary) => ({
          message:
            summary.scanned === 0 && summary.failed.length === 0
              ? t("safety.library.upToDate")
              : t("safety.library.done", { count: summary.scanned }),
          description:
            [
              ...(summary.unsafe > 0
                ? [t("safety.library.unsafe", { count: summary.unsafe })]
                : []),
              ...(summary.caution > 0
                ? [t("safety.library.caution", { count: summary.caution })]
                : []),
              ...(summary.failed.length > 0
                ? [t("safety.library.failed", { count: summary.failed.length })]
                : []),
            ].join(" · ") || undefined,
          tone: summary.unsafe > 0 || summary.failed.length > 0 ? "warning" : "success",
          viewLibrary: summary.unsafe > 0,
        }),
      }),
    [run, t],
  );
}
