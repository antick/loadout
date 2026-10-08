import type { BatchFailure, ErrorShape } from "@loadout/shared";
import { terminalSafe } from "./terminal-text";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

const COLUMN_GAP = "  ";
const EMPTY_CELL = "-";
const YES = "yes";
const NO = "no";

export type Cell = string | number | boolean | null | undefined;

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined || cell === "") return EMPTY_CELL;
  if (typeof cell === "boolean") return cell ? YES : NO;
  return terminalSafe(String(cell), { singleLine: true });
}

/** Plain aligned columns. `empty` is shown instead of a header with nothing under it. */
export function table(headers: readonly string[], rows: readonly Cell[][], empty: string): string {
  if (rows.length === 0) return empty;
  const lines = [headers.map((h) => h.toUpperCase()), ...rows.map((row) => row.map(cellText))];
  const widths = headers.map((_, column) =>
    Math.max(...lines.map((line) => (line[column] ?? "").length)),
  );
  return lines
    .map((line) =>
      line
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join(COLUMN_GAP)
        .trimEnd(),
    )
    .join("\n");
}

/** `label: value` lines with aligned values; empty values are left out. */
export function fields(pairs: readonly (readonly [string, Cell])[]): string {
  const shown = pairs.filter(([, value]) => value !== null && value !== undefined && value !== "");
  const width = Math.max(0, ...shown.map(([label]) => label.length));
  return shown
    .map(([label, value]) => `${`${label}:`.padEnd(width + 2)}${cellText(value)}`)
    .join("\n");
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "Failed: <name> - <why>": one line for each part of a batch that failed. */
export const failureLines = (failed: readonly BatchFailure[]): string[] =>
  failed.map((failure) => `Failed: ${failure.name} - ${failure.message}`);

/**
 * Text mode can carry names and descriptions a repository wrote, so control characters are shown
 * as spaces. JSON escapes them itself.
 */
function printResult(io: CliIo, json: boolean, value: unknown, text: string): void {
  io.stdout(`${json ? JSON.stringify(value ?? null) : terminalSafe(text)}\n`);
}

/** A command's result on stdout; its notice, if any, on stderr in text mode. */
export function printCommandResult(
  io: CliIo,
  json: boolean,
  result: { value: unknown; text: string; notice?: string },
): void {
  printResult(io, json, result.value, result.text);
  if (!json && result.notice) io.stderr(`${terminalSafe(result.notice)}\n`);
}

/** Findings listed per flagged skill in text mode; `--json` has them all. */
const FLAGGED_FINDINGS_SHOWN = 5;

/**
 * Failures go to stderr in both modes, so stdout only ever carries a result. `hint` says how to
 * go ahead anyway, when the command has a flag for that.
 */
export function printError(io: CliIo, json: boolean, error: ErrorShape, hint?: string): void {
  if (json) {
    const body: Record<string, unknown> = { ok: false, code: error.code, message: error.message };
    if (error.details !== undefined) body.details = error.details;
    io.stderr(`${JSON.stringify(body)}\n`);
    return;
  }
  const lines = [`Error (${error.code}): ${error.message}`];
  for (const conflict of error.details?.conflicts ?? []) {
    lines.push(`  ${conflict.path} ${conflict.reason}`);
  }
  for (const { name, report } of error.details?.flagged ?? []) {
    lines.push(`  ${name}: risk ${report.score}/100, ${report.recommendation}`);
    for (const finding of report.findings.slice(0, FLAGGED_FINDINGS_SHOWN)) {
      const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      lines.push(`    ${finding.severity} ${finding.category}: ${where} ${finding.excerpt}`);
    }
  }
  for (const secret of error.details?.secrets ?? []) {
    lines.push(`  ${secret.file}:${secret.line} ${secret.kind} ${secret.masked}`);
  }
  for (const { name, reason } of error.details?.unchecked ?? []) {
    lines.push(`  ${name}: the safety check could not finish (${reason})`);
  }
  if (hint) lines.push(hint);
  io.stderr(`${terminalSafe(lines.join("\n"))}\n`);
}
