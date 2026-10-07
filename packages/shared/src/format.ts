/**
 * The only place dates, durations, byte sizes and lists of names are turned into text.
 * Never format these inline elsewhere.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS, isCommitId } from "./constants";

const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const DATE_ONLY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const AND_LIST = new Intl.ListFormat(undefined, { type: "conjunction" });

const RELATIVE_CUTOFF = 30 * DAY_MS;

export function formatDateTime(ms: number | null | undefined): string {
  return ms ? DATE_TIME.format(new Date(ms)) : "";
}

export function formatDate(ms: number | null | undefined): string {
  return ms ? DATE_ONLY.format(new Date(ms)) : "";
}

/** "3 minutes ago" for recent times, a plain date beyond a month. */
export function formatRelative(ms: number | null | undefined, now: number = Date.now()): string {
  if (!ms) return "";
  const delta = ms - now;
  const abs = Math.abs(delta);
  if (abs >= RELATIVE_CUTOFF) return formatDate(ms);
  if (abs < MINUTE_MS) return RELATIVE.format(Math.round(delta / SECOND_MS), "second");
  if (abs < HOUR_MS) return RELATIVE.format(Math.round(delta / MINUTE_MS), "minute");
  if (abs < DAY_MS) return RELATIVE.format(Math.round(delta / HOUR_MS), "hour");
  return RELATIVE.format(Math.round(delta / DAY_MS), "day");
}

/** `45s`: a duration in whole seconds. */
export function formatSeconds(ms: number): string {
  return `${Math.round(ms / SECOND_MS)}s`;
}

/** `2026-09-19T15:30:45.123Z`, for log lines. UTC. */
export function formatTimestampIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** `20260919-153045`, used in file names. UTC. */
export function formatTimestampCompact(ms: number): string {
  const iso = formatTimestampIso(ms);
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

const COMPACT_COUNT = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** `1.2K`, `34K`, `5.6M`: a large count short enough for a card. */
export function formatCount(count: number): string {
  return COMPACT_COUNT.format(count);
}

const WHOLE_NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** `9,400`: a whole number with the reader's digit grouping. */
export function formatNumber(value: number): string {
  return WHOLE_NUMBER.format(value);
}

/** `87%`: a share from 0 to 1, rounded to a whole percent. */
export function formatPercent(fraction: number): string {
  return `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`;
}

/** "Codex, Goose and Warp". */
export function formatNameList(names: readonly string[]): string {
  return AND_LIST.format(names);
}

/** Git shows commit ids this short. */
const SHORT_COMMIT_LENGTH = 7;

/** `4f2a9c1`: a commit id as Git shortens it; any other revision (a version like `1.2.0`) whole. */
export function formatRevision(revision: string): string {
  return isCommitId(revision) ? revision.slice(0, SHORT_COMMIT_LENGTH) : revision;
}
