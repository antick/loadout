import type { ErrorCode, ErrorDetails, ErrorShape, TargetConflict } from "@loadout/shared";

/** The one error type core throws on purpose. Anything else is a bug and surfaces as INTERNAL. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const invalid = (message: string): AppError => new AppError("INVALID_INPUT", message);
export const notFound = (message: string): AppError => new AppError("NOT_FOUND", message);
export const exists = (message: string): AppError => new AppError("ALREADY_EXISTS", message);
export const unsupported = (message: string): AppError => new AppError("UNSUPPORTED", message);
export const cancelled = (message = "Operation cancelled"): AppError =>
  new AppError("CANCELLED", message);

export function targetConflict(conflicts: TargetConflict[]): AppError {
  const first = conflicts[0];
  const summary = first
    ? `Refusing to replace "${first.path}": it ${first.reason}. The existing content was left untouched — import it into the library, or move it aside, and try again.`
    : "Target conflict";
  const extra = conflicts.length > 1 ? ` (+${conflicts.length - 1} more)` : "";
  return new AppError("TARGET_CONFLICT", summary + extra, { conflicts });
}

export function isAppError(error: unknown, code?: ErrorCode): error is AppError {
  return error instanceof AppError && (code === undefined || error.code === code);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Serialise any thrown value for IPC or CLI output. */
export function toErrorShape(error: unknown): ErrorShape {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code === "string" && /^E[A-Z]+$/.test(code)) {
    return { code: "IO", message: errorMessage(error) };
  }
  return { code: "INTERNAL", message: errorMessage(error) };
}
