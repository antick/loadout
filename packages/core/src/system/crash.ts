import { readFileSync } from "node:fs";
import type { CrashInfo } from "@skillboard/shared";
import { removePathSync, statOrNull } from "../util/fs";
import { sanitizeText } from "./sanitize";

const MESSAGE_MAX_LINES = 3;
const FALLBACK_MESSAGE = "The app closed unexpectedly.";

/**
 * Read the marker the host leaves behind when it goes down. A marker that cannot be parsed still
 * counts as a crash: the file's own time stands in, so the user is told either way.
 */
export function readCrashMarker(markerPath: string, homeDir: string): CrashInfo | null {
  const stat = statOrNull(markerPath);
  if (!stat?.isFile()) return null;
  let at = stat.mtimeMs;
  let message = "";
  try {
    const raw = readFileSync(markerPath, "utf8");
    try {
      const parsed = JSON.parse(raw) as Partial<CrashInfo>;
      if (typeof parsed.at === "number" && Number.isFinite(parsed.at)) at = parsed.at;
      message = typeof parsed.message === "string" ? parsed.message : "";
    } catch {
      message = raw;
    }
  } catch {
    // Unreadable marker: report the crash without its text.
  }
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MESSAGE_MAX_LINES);
  return {
    at: Math.round(at),
    message: sanitizeText(lines.join("\n"), homeDir) || FALLBACK_MESSAGE,
  };
}

export function clearCrashMarker(markerPath: string): void {
  removePathSync(markerPath);
}
