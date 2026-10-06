import { appendFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_SLUG, formatTimestampIso, MIB } from "@loadout/shared";
import { errorMessage } from "./errors";
import { ensureDir, statOrNull } from "./util/fs";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, error?: unknown): void;
  info(message: string, error?: unknown): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
  readonly filePath: string | null;
}

export const LOG_FILE_NAME = `${APP_SLUG}.log`;
const ROTATE_BYTES = 5 * MIB;
const KEEP_ROTATED = 3;
/** A long-running process (the app) checks the size again after this many lines. */
export const ROTATE_CHECK_LINES = 500;

function rotate(filePath: string): void {
  try {
    if ((statOrNull(filePath)?.size ?? 0) < ROTATE_BYTES) return;
    const oldest = `${filePath}.${KEEP_ROTATED}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = KEEP_ROTATED - 1; i >= 1; i -= 1) {
      if (existsSync(`${filePath}.${i}`)) renameSync(`${filePath}.${i}`, `${filePath}.${i + 1}`);
    }
    renameSync(filePath, `${filePath}.1`);
  } catch {
    // Logging must never take the app down.
  }
}

/**
 * Append-only file logger with size rotation, at start and every `ROTATE_CHECK_LINES` lines.
 * Also mirrors to the console when `echo` is set.
 */
export function createFileLogger(logsDir: string, echo = false): Logger {
  ensureDir(logsDir);
  const filePath = join(logsDir, LOG_FILE_NAME);
  rotate(filePath);
  let lines = 0;
  const write = (level: LogLevel, message: string, error?: unknown): void => {
    lines += 1;
    if (lines % ROTATE_CHECK_LINES === 0) rotate(filePath);
    const suffix = error === undefined ? "" : `: ${errorMessage(error)}`;
    const line = `${formatTimestampIso(Date.now())} ${level.toUpperCase().padEnd(5)} ${message}${suffix}\n`;
    try {
      appendFileSync(filePath, line);
    } catch {
      // The logs folder alone may have been removed while running: make it again, but never
      // bring back a library that was deleted as a whole. A full or read-only disk should not
      // break the operation being logged.
      try {
        if (!existsSync(dirname(logsDir))) return;
        ensureDir(logsDir);
        appendFileSync(filePath, line);
      } catch {
        // Give up on this line.
      }
    }
    if (echo) (level === "error" || level === "warn" ? console.error : console.log)(line.trimEnd());
  };
  return {
    filePath,
    debug: (m, e) => write("debug", m, e),
    info: (m, e) => write("info", m, e),
    warn: (m, e) => write("warn", m, e),
    error: (m, e) => write("error", m, e),
  };
}

export const silentLogger: Logger = {
  filePath: null,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
