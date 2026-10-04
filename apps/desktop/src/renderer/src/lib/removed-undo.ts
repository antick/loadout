import { REMOVED_KEEP_DAYS } from "@loadout/shared";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { type ToastAction, toastError, toastSuccess } from "@/lib/toast";

/** Put back every folder an action set aside. The restore's `data:changed` refreshes the lists. */
async function undo(removedIds: readonly string[]): Promise<void> {
  try {
    for (const id of removedIds) await api.storage.restoreRemoved(id);
    toastSuccess(i18n.t("settings.storage.removed.undone", { count: removedIds.length }));
  } catch (error) {
    toastError(error, "settings.storage.removed.errors.restore");
  }
}

/** An Undo button for a toast; undefined when the action kept nothing to put back. */
export function undoAction(removedIds: readonly string[]): ToastAction | undefined {
  if (removedIds.length === 0) return undefined;
  return { label: i18n.t("common.undo"), onClick: () => void undo(removedIds) };
}

/**
 * Toast an action that replaced or deleted folders. When it kept them in Recently removed, the
 * toast says so (`note`, else the words for replaced agent folders) and offers Undo.
 */
export function toastWithUndo(message: string, removedIds: readonly string[], note?: string): void {
  const action = undoAction(removedIds);
  if (!action) {
    toastSuccess(message);
    return;
  }
  toast.success(message, {
    description:
      note ??
      i18n.t("settings.storage.removed.keptNote", {
        count: removedIds.length,
        days: REMOVED_KEEP_DAYS,
      }),
    action,
  });
}
