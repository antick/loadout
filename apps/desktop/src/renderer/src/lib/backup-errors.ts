import { ApiError, type ErrorCode } from "@loadout/shared";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { errorMessage } from "@/lib/toast";

/** Codes with their own plain-language explanation under `backupPage.errors.*`. */
const FRIENDLY_CODES = [
  "GIT_MISSING",
  "GIT_AUTH",
  "NETWORK",
  "TIMEOUT",
  "GIT_REJECTED",
  "GIT_UNRELATED",
  "GIT_NO_UPSTREAM",
  "GIT_NOT_REPO",
  "SYNC_CONFLICT",
  "GITHUB_TOKEN_INVALID",
  "GITHUB_SCOPE",
  "GITHUB_DEVICE_EXPIRED",
  "GITHUB_DEVICE_DENIED",
  "GITHUB_NOT_CONFIGURED",
  "CREDENTIALS_UNAVAILABLE",
] as const satisfies readonly ErrorCode[];

/** Failures that re-downloading the remote backup fixes. */
const RECOVERABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  "GIT_UNRELATED",
  "GIT_REJECTED",
  "SYNC_CONFLICT",
]);

function codeOf(error: unknown): ErrorCode | null {
  return error instanceof ApiError ? error.code : null;
}

/** The one place a backup failure becomes text: friendly copy per code, else the raw message. */
export function backupErrorText(error: unknown, t: TFunction): string {
  const code = codeOf(error);
  const friendly = FRIENDLY_CODES.find((candidate) => candidate === code);
  return friendly ? t(`backupPage.errors.${friendly}`) : errorMessage(error, "errors.backup");
}

export function toastBackupError(error: unknown, t: TFunction): void {
  if (codeOf(error) === "CANCELLED") return;
  toast.error(backupErrorText(error, t));
}

export function isRecoverableError(error: unknown): boolean {
  const code = codeOf(error);
  return code !== null && RECOVERABLE_CODES.has(code);
}

export function isAuthError(error: unknown): boolean {
  return codeOf(error) === "GIT_AUTH";
}
