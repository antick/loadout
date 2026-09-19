import type { SyncOutcome } from "@skillboard/shared";
import type { TFunction } from "i18next";
import { toast } from "sonner";

/** Tell the user what a sync did: merged updates, skills kept for review, the snapshot taken. */
export function toastSyncOutcome(outcome: SyncOutcome, t: TFunction): void {
  const merge = outcome.merge;
  const conflicts = merge?.newConflicts.length ?? 0;
  const updated = merge?.updated.length ?? 0;
  const snapshot = outcome.snapshot
    ? t("backupPage.sync.snapshot", { tag: outcome.snapshot })
    : undefined;

  if (conflicts > 0) {
    toast.warning(t("backupPage.sync.conflicts", { count: conflicts }), { description: snapshot });
    return;
  }
  if (updated > 0) {
    toast.success(t("backupPage.sync.merged", { count: updated }), { description: snapshot });
    return;
  }
  if (!outcome.committed && !outcome.pushed) {
    toast.success(t("backupPage.sync.upToDate"));
    return;
  }
  toast.success(t("backupPage.sync.done"), { description: snapshot });
}
