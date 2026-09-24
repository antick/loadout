import { appendFileSync, existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_SLUG } from "@loadout/shared";
import { errorMessage } from "./errors";
import { ensureDir } from "./util/fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, error?: unknown): void;
  info(message: string, error?: unknown): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
  readonly filePath: string | null;
}

export const LOG_FILE_NAME = `${APP_SLUG}.log`;
const ROTATE_BYTES = 5 * 1024 * 1024;
const KEEP_ROTATED = 3;

function rotate(filePath: string): void {
  try {
    if (!existsSync(filePath) || statSync(filePath).size < ROTATE_BYTES) return;
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

/** Append-only file logger with size rotation. Also mirrors to the console when `echo` is set. */
export function createFileLogger(logsDir: string, echo = false): Logger {
  ensureDir(logsDir);
  const filePath = join(logsDir, LOG_FILE_NAME);
  rotate(filePath);
  const write = (level: LogLevel, message: string, error?: unknown): void => {
    const suffix = error === undefined ? "" : `: ${errorMessage(error)}`;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${suffix}\n`;
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
