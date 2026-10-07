import { type BatchResult, REMOVED_KEEP_DAYS } from "@loadout/shared";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { runBatch, toastBatchOutcome } from "@/lib/batch";
import { i18n } from "@/lib/i18n";
import { type ToastAction, toastError, toastSuccess } from "@/lib/toast";

/**
 * Put back every folder an action set aside, each tried whatever happened to the others, then
 * say how many went back and which did not. The restore's `data:changed` refreshes the lists.
 */
async function undo(removedIds: readonly string[]): Promise<void> {
  try {
    // Named as Recently removed lists them, for a failure to say which.
    const names = new Map((await api.storage.removed()).map((entry) => [entry.id, entry.name]));
    const result = await runBatch(
      removedIds,
      (id) => names.get(id) ?? id,
      (id) => api.storage.restoreRemoved(id),
    );
    toastBatchOutcome(
      i18n.t("settings.storage.removed.undone", { count: result.succeeded }),
      result.failed,
    );
  } catch (error) {
    // One folder alone: its own error says what went wrong.
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

/**
 * Run jobs that each set folders aside in Recently removed (resolving to their ids), one after
 * the other, then toast the outcome with one Undo that puts back everything set aside. One item
 * is toasted as the single action it is, with a note on what was kept.
 */
export async function runWithUndo<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  job: (item: T) => Promise<readonly string[]>,
  summary: (succeeded: number) => string,
): Promise<BatchResult> {
  const removedIds: string[] = [];
  const result = await runBatch(items, nameOf, async (item) => {
    removedIds.push(...(await job(item)));
  });
  if (items.length === 1) toastWithUndo(summary(result.succeeded), removedIds);
  else {
    toastBatchOutcome(summary(result.succeeded), result.failed, { action: undoAction(removedIds) });
  }
  return result;
}
