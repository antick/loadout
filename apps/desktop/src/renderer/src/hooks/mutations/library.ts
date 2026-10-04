import { type BatchUpdateResult } from "@loadout/shared";
import { type UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { describeFailures, FAILURE_LIST_CLASS } from "@/lib/batch";
import { toastSuccess } from "@/lib/toast";

/** Update several skills. Skills whose update would delete files are held back, never forced. */
export function useUpdateSkills(): UseMutationResult<BatchUpdateResult, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillIds: string[]) => api.updates.updateMany(skillIds),
    onSuccess: (result) => {
      const summary = t("library.updates.batchDone", {
        count: result.updated,
        unchanged: result.unchanged,
      });
      const lines = [
        ...(result.heldBack.length > 0
          ? [t("library.updates.heldBack", { names: result.heldBack.join(", ") })]
          : []),
        ...(result.failed.length > 0 ? [describeFailures(result.failed)] : []),
      ];
      if (lines.length === 0) {
        toastSuccess(summary);
        return;
      }
      toast.warning(summary, {
        description: lines.join("\n"),
        descriptionClassName: FAILURE_LIST_CLASS,
      });
    },
    error: "library.errors.update",
  });
}
