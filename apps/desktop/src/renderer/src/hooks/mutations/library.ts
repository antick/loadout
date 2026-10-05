import { type BatchUpdateResult } from "@loadout/shared";
import { type UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { toastBatchOutcome } from "@/lib/batch";

/** Update several skills. Skills whose update would delete files are held back, never forced. */
export function useUpdateSkills(): UseMutationResult<BatchUpdateResult, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillIds: string[]) => api.updates.updateMany(skillIds),
    onSuccess: (result) =>
      toastBatchOutcome(
        t("library.updates.batchDone", { count: result.updated, unchanged: result.unchanged }),
        result.failed,
        {
          description:
            result.heldBack.length > 0
              ? t("library.updates.heldBack", { names: result.heldBack.join(", ") })
              : null,
        },
      ),
    error: "library.errors.update",
  });
}
