import type { UsageReport } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Turn usage tracking on (reads the logs) or off (forgets what was read). */
export function useSetUsageTracking(): UseMutationResult<UsageReport, unknown, boolean> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: keys.usage.scan,
    mutationFn: (enabled: boolean) => api.usage.setEnabled(enabled),
    onSuccess: (report) => {
      queryClient.setQueryData(keys.usage.report, report);
      if (!report.enabled) {
        toastSuccess(t("usage.turnedOff"));
        return;
      }
      const runs = report.skills.reduce((sum, skill) => sum + skill.uses, 0);
      const found = report.logs.some((log) => log.found);
      toastSuccess(
        t("usage.turnedOn"),
        found ? t("usage.turnedOnFound", { count: runs }) : t("usage.noLogs"),
      );
    },
    onError: (error) => toastError(error, "usage.errors.toggle"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.settings.root }),
  });
}
