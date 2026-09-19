/**
 * The only place dates, durations and byte sizes are turned into text.
 * Never format these inline elsewhere.
 */

const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const DATE_ONLY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_CUTOFF = 30 * DAY;

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
  if (abs < MINUTE) return RELATIVE.format(Math.round(delta / SECOND), "second");
  if (abs < HOUR) return RELATIVE.format(Math.round(delta / MINUTE), "minute");
  if (abs < DAY) return RELATIVE.format(Math.round(delta / HOUR), "hour");
  return RELATIVE.format(Math.round(delta / DAY), "day");
}

/** `20260919-153045`, used in snapshot tags and export file names. UTC. */
export function formatTimestampCompact(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

/** Inverse of {@link formatTimestampCompact}. Returns null when the text is not a compact stamp. */
export function parseTimestampCompact(text: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(ms) ? null : ms;
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
