import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Zippable, strToU8, zipSync } from "fflate";
import {
  APP_SLUG,
  type DiagnosticInfo,
  type LogExcerpt,
  type LogExport,
  formatTimestampCompact,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { LOG_FILE_NAME } from "../log";
import { ensureDir, readDirSafe, statOrNull } from "../util/fs";
import { sanitizeText } from "./sanitize";

const EXCERPT_LINES = 200;
/** Matches the level column the file logger writes right after the timestamp. */
const WARNING_LINE = /^\S+\s+(?:WARN|ERROR)\b/;
const EXPORT_ACTIVITY_LIMIT = 2000;
const EXPORT_PREFIX = `${APP_SLUG}-logs-`;
const EXPORT_EXTENSION = ".zip";
const ZIP_LOGS_DIR = "logs";
const ZIP_ACTIVITY_FILE = "activity.json";
const ZIP_DIAGNOSTICS_FILE = "diagnostics.json";
const ZIP_CRASH_FILE = "last-crash.json";

function currentLogPath(ctx: CoreContext): string {
  return ctx.log.filePath ?? join(ctx.paths.logsDir, LOG_FILE_NAME);
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const ROTATED_SUFFIX = /^\.\d+$/;

function isLogFileName(name: string): boolean {
  if (name === LOG_FILE_NAME) return true;
  return name.startsWith(LOG_FILE_NAME) && ROTATED_SUFFIX.test(name.slice(LOG_FILE_NAME.length));
}

/** The live log and its rotated siblings (`<name>.1` …), newest first. Nothing else qualifies. */
export function listLogFiles(logsDir: string): string[] {
  return readDirSafe(logsDir)
    .filter((entry) => entry.isFile() && isLogFileName(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => join(logsDir, name));
}

/** Tail of the current log, cleaned of personal details, for pasting into a bug report. */
export function readLogExcerpt(ctx: CoreContext): LogExcerpt {
  const logPath = currentLogPath(ctx);
  const lines = readOrEmpty(logPath)
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(-EXCERPT_LINES);
  return {
    logPath,
    excerpt: sanitizeText(lines.join("\n"), ctx.homeDir),
    lineCount: lines.length,
    hasWarnings: lines.some((line) => WARNING_LINE.test(line)),
  };
}

/** Downloads when it can be used, the home folder otherwise. */
function exportDir(ctx: CoreContext): string {
  try {
    ensureDir(ctx.host.downloadsDir);
    return ctx.host.downloadsDir;
  } catch {
    return ctx.homeDir;
  }
}

/**
 * Bundle what a bug report needs. The entries are picked one by one, never a folder sweep, so
 * the database, the library config and anything credential-like can not end up in the archive.
 */
export function exportLogs(ctx: CoreContext, diagnostics: DiagnosticInfo): LogExport {
  const clean = (text: string): Uint8Array => strToU8(sanitizeText(text, ctx.homeDir));
  const entries: Zippable = {};
  for (const file of listLogFiles(ctx.paths.logsDir)) {
    const name = file.slice(ctx.paths.logsDir.length + 1);
    entries[`${ZIP_LOGS_DIR}/${name}`] = clean(readOrEmpty(file));
  }
  if (statOrNull(ctx.paths.crashMarkerPath)?.isFile()) {
    entries[ZIP_CRASH_FILE] = clean(readOrEmpty(ctx.paths.crashMarkerPath));
  }
  const activity = ctx.activity.list(EXPORT_ACTIVITY_LIMIT);
  entries[ZIP_ACTIVITY_FILE] = clean(`${JSON.stringify(activity, null, 2)}\n`);
  entries[ZIP_DIAGNOSTICS_FILE] = clean(`${JSON.stringify(diagnostics, null, 2)}\n`);

  const zipPath = join(
    exportDir(ctx),
    `${EXPORT_PREFIX}${formatTimestampCompact(Date.now())}${EXPORT_EXTENSION}`,
  );
  writeFileSync(zipPath, zipSync(entries));
  return { zipPath, fileCount: Object.keys(entries).length };
}
