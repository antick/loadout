import type { SyncOutcome } from "@loadout/shared";
import type { TFunction } from "i18next";
import { toast } from "sonner";

/** Tell the user what a sync did: merged updates, skills kept for review, the snapshot taken. */
export function toastSyncOutcome(outcome: SyncOutcome, t: TFunction): void {
  const merge = outcome.merge;
  const conflicts = merge?.newConflicts.length ?? 0;
  const updated = merge?.updated.length ?? 0;
  const removed = merge?.removed ?? [];
  // Named, because each one left this machine without being asked about.
  const removedText =
    removed.length > 0
      ? t("backupSync.removed", {
          count: removed.length,
          names: removed.map((skill) => skill.name).join(", "),
          device: removed[0]?.fromDevice ?? "",
        })
      : null;
  const snapshotText = outcome.snapshot
    ? t("backupPage.sync.snapshot", { tag: outcome.snapshot })
    : null;
  const snapshot = [removedText, snapshotText].filter(Boolean).join(" ") || undefined;

  if (conflicts > 0) {
    toast.warning(t("backupPage.sync.conflicts", { count: conflicts }), { description: snapshot });
    return;
  }
  if (updated > 0 || removed.length > 0) {
    toast.success(t("backupPage.sync.merged", { count: updated + removed.length }), {
      description: snapshot,
    });
    return;
  }
  if (!outcome.committed && !outcome.pushed) {
    toast.success(t("backupPage.sync.upToDate"));
    return;
  }
  toast.success(t("backupPage.sync.done"), { description: snapshot });
}
