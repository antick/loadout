import { REMOVED_KEEP_DAYS } from "@loadout/shared";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { keys } from "@/lib/query-keys";
import { type ToastAction, toastError, toastSuccess } from "@/lib/toast";

/** A restore changes agent and project folders and the Recently removed list itself. */
export function invalidateAfterRestore(queryClient: QueryClient): void {
  for (const queryKey of [
    keys.storage.root,
    keys.workspace.root,
    keys.projects.root,
    keys.skills.root,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** Put back every folder an action set aside. */
async function undo(queryClient: QueryClient, removedIds: readonly string[]): Promise<void> {
  try {
    for (const id of removedIds) await api.storage.restoreRemoved(id);
    toastSuccess(i18n.t("settings.storage.removed.undone", { count: removedIds.length }));
  } catch (error) {
    toastError(error, "settings.storage.removed.errors.restore");
  } finally {
    invalidateAfterRestore(queryClient);
  }
}

/** An Undo button for a toast; undefined when the action kept nothing to put back. */
export function undoAction(
  queryClient: QueryClient,
  removedIds: readonly string[],
): ToastAction | undefined {
  if (removedIds.length === 0) return undefined;
  return { label: i18n.t("common.undo"), onClick: () => void undo(queryClient, removedIds) };
}

/**
 * Toast an action that replaced or deleted folders. When it kept them in Recently removed, the
 * toast says so and offers Undo.
 */
export function toastWithUndo(
  queryClient: QueryClient,
  message: string,
  removedIds: readonly string[],
): void {
  const action = undoAction(queryClient, removedIds);
  if (!action) {
    toastSuccess(message);
    return;
  }
  toast.success(message, {
    description: i18n.t("settings.storage.removed.keptNote", {
      count: removedIds.length,
      days: REMOVED_KEEP_DAYS,
    }),
    action,
  });
}
