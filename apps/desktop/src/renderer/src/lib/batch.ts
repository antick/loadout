import type { BatchFailure, BatchResult } from "@loadout/shared";
import { toast } from "sonner";
import { TOAST_MAX_CONFLICT_PATHS } from "@/lib/constants";
import { i18n } from "@/lib/i18n";
import { errorMessage, toastSuccess } from "@/lib/toast";

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

/** Toast a finished batch: plain success, or a warning that lists what failed. */
export function toastBatchOutcome(summary: string, failed: readonly BatchFailure[]): void {
  if (failed.length === 0) {
    toastSuccess(summary);
    return;
  }
  toast.warning(i18n.t("localSkills.batch.withFailures", { summary, count: failed.length }), {
    description: describeFailures(failed),
    descriptionClassName: "text-xs whitespace-pre-line break-all",
  });
}
