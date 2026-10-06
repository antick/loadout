import { SAFETY_SCAN_LIBRARY_KEY, type SafetyScanSummary } from "@loadout/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRunInstallTask } from "@/features/install/use-install-task";
import { api } from "@/lib/api";

/**
 * Scan the library with a progress toast ("Safety check 3/20: name"). Skills whose report still
 * holds are skipped unless `force`.
 */
export function useScanLibrary(): (force?: boolean) => Promise<SafetyScanSummary | null> {
  const { t } = useTranslation();
  const run = useRunInstallTask();
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
