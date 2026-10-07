import type { BatchFailure, BatchResult } from "@loadout/shared";
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import { describeFailures, FAILURE_LIST_CLASS, type ToastAction, errorMessage } from "@/lib/toast";

/** The item when there is exactly one, so a toast or a title can name it instead of counting. */
export function soleItem<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

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

/**
 * `runSequentially`, except that a batch of one item is that action itself: its failure rejects,
 * so the mutation's error toast shows it, instead of being collected into the result.
 */
export async function runBatch<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  job: (item: T) => Promise<unknown>,
): Promise<BatchResult> {
  const only = soleItem(items);
  if (only === undefined) return runSequentially(items, nameOf, job);
  await job(only);
  return { succeeded: 1, failed: [] };
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
