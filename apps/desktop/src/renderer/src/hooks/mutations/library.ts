import {
  type BatchUpdateResult,
  REMOVED_KEEP_DAYS,
  type RemoveSkillsResult,
  type Skill,
} from "@loadout/shared";
import { type UseMutationResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { soleItem, toastBatchOutcome } from "@/lib/batch";
import { undoAction } from "@/lib/removed-undo";

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

/** Remove skills from the library (and every agent they were deployed to). Toasts the counts. */
function useRemoveSkills(): UseMutationResult<RemoveSkillsResult, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillIds: string[]) => api.skills.removeMany(skillIds),
    onSuccess: (result) =>
      toastBatchOutcome(t("skills.removed", { count: result.succeeded }), result.failed, {
        action: undoAction(result.removedIds),
        description:
          result.removedIds.length > 0
            ? t("skills.removedKept", { count: result.removedIds.length, days: REMOVED_KEEP_DAYS })
            : null,
      }),
    error: "errors.removeSkills",
  });
}

/**
 * Ask, then delete library skills. The confirm spells out everything that goes with them, and
 * that they wait in Recently removed.
 * Resolves to true when the delete was started.
 */
export function useDeleteSkills(): (skills: readonly Skill[]) => Promise<boolean> {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const remove = useRemoveSkills();
  const { mutate } = remove;

  return useCallback(
    async (skills) => {
      if (skills.length === 0) return false;
      const deployed = skills.reduce((sum, skill) => sum + skill.deployments.length, 0);
      const only = soleItem(skills);
      const ok = await confirm({
        title: only
          ? t("library.delete.titleOne", { name: only.name })
          : t("library.delete.titleMany", { count: skills.length }),
        description: [
          t("library.delete.description", { count: skills.length }),
          deployed > 0 ? t("library.delete.deployedCopies", { count: deployed }) : null,
          t("library.delete.keptFor", { count: skills.length, days: REMOVED_KEEP_DAYS }),
        ]
          .filter(Boolean)
          .join(" "),
        items: skills.length > 1 ? skills.map((skill) => skill.name) : undefined,
        confirmLabel: t("library.delete.confirm", { count: skills.length }),
        destructive: true,
      });
      if (!ok) return false;
      mutate(skills.map((skill) => skill.id));
      return true;
    },
    [confirm, mutate, t],
  );
}
