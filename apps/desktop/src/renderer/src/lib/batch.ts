import type { BatchFailure, BatchResult } from "@loadout/shared";
import { toast } from "sonner";
import { TOAST_MAX_CONFLICT_PATHS } from "@/lib/constants";
import { i18n } from "@/lib/i18n";
import { undoAction } from "@/lib/removed-undo";
import { FAILURE_LIST_CLASS, type ToastAction, errorMessage } from "@/lib/toast";

/**
 * Run one job per item, one after the other, and collect what failed. Used where the backend has
 * no batch call and the jobs touch the same folders, so they must not overlap.
 */
export async function runSequentially<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  job: (item: T) => Promise<unknown>,
): Promise<BatchResult> {
  let succeeded = 0;
  const failed: BatchFailure[] = [];
  for (const item of items) {
    try {
      await job(item);
      succeeded += 1;
    } catch (error) {
      failed.push({ name: nameOf(item), message: errorMessage(error) });
    }
  }
  return { succeeded, failed };
}

/** Failures as toast lines, capped so the toast stays readable. */
export function describeFailures(failed: readonly BatchFailure[]): string {
  const lines = failed
    .slice(0, TOAST_MAX_CONFLICT_PATHS)
    .map((failure) => `${failure.name}: ${failure.message}`);
  const rest = failed.length - lines.length;
  if (rest > 0) lines.push(i18n.t("common.andMore", { count: rest }));
  return lines.join("\n");
}

/** What a batch toast can carry besides its summary. */
export interface BatchToastExtras {
  /** A button, such as Undo, that takes back what did succeed. */
  action?: ToastAction;
  /** One more line, e.g. what to do so the agents see the change. */
  description?: string | null;
}

/** Toast a finished batch: plain success, or a warning that lists what failed. */
export function toastBatchOutcome(
  summary: string,
  failed: readonly BatchFailure[],
  extras: BatchToastExtras = {},
): void {
  const description = extras.description ?? undefined;
  if (failed.length === 0) {
    toast.success(summary, { description, action: extras.action });
    return;
  }
  const lines = [describeFailures(failed), ...(description ? [description] : [])];
  toast.warning(i18n.t("localSkills.batch.withFailures", { summary, count: failed.length }), {
    description: lines.join("\n"),
    descriptionClassName: FAILURE_LIST_CLASS,
    action: extras.action,
  });
}

/**
 * Run jobs that each set folders aside in Recently removed (resolving to their ids), one after
 * the other, then toast the outcome with one Undo that puts back everything set aside.
 */
export async function runWithUndo<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  job: (item: T) => Promise<readonly string[]>,
  summary: (succeeded: number) => string,
): Promise<BatchResult> {
  const removedIds: string[] = [];
  const result = await runSequentially(items, nameOf, async (item) => {
    removedIds.push(...(await job(item)));
  });
  toastBatchOutcome(summary(result.succeeded), result.failed, { action: undoAction(removedIds) });
  return result;
}
