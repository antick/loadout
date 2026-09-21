import { ApiError, type ApplyResult, type TargetConflict } from "@loadout/shared";
import { toast } from "sonner";
import { TOAST_MAX_CONFLICT_PATHS } from "@/lib/constants";
import { i18n } from "@/lib/i18n";

/** Conflicting paths as a toast description, capped so the toast stays readable. */
function describeConflicts(conflicts: readonly TargetConflict[]): string {
  const shown = conflicts.slice(0, TOAST_MAX_CONFLICT_PATHS).map((c) => c.path);
  const rest = conflicts.length - shown.length;
  if (rest > 0) shown.push(i18n.t("common.andMore", { count: rest }));
  return shown.join("\n");
}

/** Readable message for anything thrown; `fallbackKey` is an i18n key used when there is none. */
export function errorMessage(error: unknown, fallbackKey = "errors.generic"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return i18n.t(fallbackKey);
}

/** Toast a failure. TARGET_CONFLICT errors list the paths that were in the way. */
export function toastError(error: unknown, fallbackKey?: string): void {
  if (error instanceof ApiError && error.code === "CANCELLED") return;
  const conflicts = error instanceof ApiError ? (error.details?.conflicts ?? []) : [];
  toast.error(errorMessage(error, fallbackKey), {
    description: conflicts.length > 0 ? describeConflicts(conflicts) : undefined,
    descriptionClassName: "font-mono text-xs whitespace-pre-line break-all",
  });
}

/** Toast a finished action. */
export function toastSuccess(message: string, description?: string): void {
  toast.success(message, { description });
}

/** Toast the outcome of a deploy batch: counts, then conflicts and failures when there are any. */
export function toastApplyResult(result: ApplyResult, action: "add" | "remove"): void {
  const changed = action === "add" ? result.added : result.removed;
  const summary = i18n.t(action === "add" ? "deploy.appliedAdd" : "deploy.appliedRemove", {
    count: changed,
    skipped: result.skipped,
  });
  const problems = result.conflicts.length + result.failed.length;
  if (problems === 0) {
    toast.success(summary);
    return;
  }
  const lines = [
    ...(result.conflicts.length > 0 ? [describeConflicts(result.conflicts)] : []),
    ...result.failed
      .slice(0, TOAST_MAX_CONFLICT_PATHS)
      .map((failure) => `${failure.name}: ${failure.message}`),
  ];
  toast.warning(i18n.t("deploy.appliedWithProblems", { summary, count: problems }), {
    description: lines.join("\n"),
    descriptionClassName: "text-xs whitespace-pre-line break-all",
  });
}
