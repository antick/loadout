import { REMOVED_KEEP_DAYS, type Skill } from "@loadout/shared";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { toastWithUndo } from "@/lib/removed-undo";
import { toastError } from "@/lib/toast";

export interface MergeDuplicate {
  /** Ask, then keep `keep` and remove `remove`. Resolves to true when the merge was done. */
  run: (keep: Skill, remove: Skill) => Promise<boolean>;
  /** The merge is running, or being previewed. */
  busy: boolean;
}

/**
 * Keep one of two skills that look alike. A dry run first says what the kept skill would take
 * over, and a refusal (a folder in an agent's way) shows before anything is asked; then the
 * person confirms. The removed skill waits in Recently removed with Undo.
 */
export function useMergeDuplicate(): MergeDuplicate {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (keep: Skill, remove: Skill): Promise<boolean> => {
      setBusy(true);
      try {
        const plan = await api.duplicates.merge(keep.id, remove.id, { dryRun: true });
        const carried = [
          plan.tagsAdded > 0 ? t("duplicates.merge.tags", { count: plan.tagsAdded }) : null,
          plan.presetsJoined > 0
            ? t("duplicates.merge.presets", { count: plan.presetsJoined })
            : null,
          plan.deployedTo.length > 0
            ? t("duplicates.merge.agents", { agents: plan.deployedTo.join(", ") })
            : null,
          plan.blockedFor.length > 0
            ? t("duplicates.merge.blocked", { keep: keep.name, agents: plan.blockedFor.join(", ") })
            : null,
        ].filter((line): line is string => line !== null);
        const ok = await confirm({
          title: t("duplicates.merge.title", { keep: keep.name }),
          description: t(
            carried.length > 0
              ? "duplicates.merge.description"
              : "duplicates.merge.descriptionPlain",
            {
              keep: keep.name,
              remove: remove.name,
              days: REMOVED_KEEP_DAYS,
            },
          ),
          items: carried,
          confirmLabel: t("duplicates.merge.confirm", { remove: remove.name }),
          destructive: true,
        });
        if (!ok) return false;
        const result = await api.duplicates.merge(keep.id, remove.id);
        toastWithUndo(
          t("duplicates.merge.done", { keep: keep.name, remove: remove.name }),
          result.removedEntryId ? [result.removedEntryId] : [],
        );
        return true;
      } catch (error) {
        toastError(error, "duplicates.errors.merge");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [confirm, t],
  );

  return { run, busy };
}
