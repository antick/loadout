import type { TargetConflict } from "./types";

/** Stable machine-readable error codes, shared by the app, the IPC bridge and the CLI. */
export const ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "TARGET_CONFLICT",
  "CANCELLED",
  "NETWORK",
  "TIMEOUT",
  "GIT",
  "GIT_MISSING",
  "GIT_AUTH",
  "GIT_REJECTED",
  "GIT_UNRELATED",
  "GIT_NO_UPSTREAM",
  "GIT_NOT_REPO",
  "SYNC_CONFLICT",
  "BACKUP_TOO_NEW",
  "GITHUB_TOKEN_INVALID",
  "GITHUB_SCOPE",
  "GITHUB_DEVICE_EXPIRED",
  "GITHUB_DEVICE_DENIED",
  "GITHUB_NOT_CONFIGURED",
  "CREDENTIALS_UNAVAILABLE",
  "BUSY",
  "UNSUPPORTED",
  "IO",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetails {
  conflicts?: TargetConflict[];
  [key: string]: unknown;
}

/** How an error travels over IPC and in CLI `--json` output. */
export interface ErrorShape {
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

export type ApiResponse<T> = { ok: true; value: T } | { ok: false; error: ErrorShape };

/** Thrown on the calling side (renderer, CLI) when a call fails. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(shape: ErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.code = shape.code;
    this.details = shape.details;
  }
}
