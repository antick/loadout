import { type ErrorShape, formatDateTime } from "@loadout/shared";

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
  return String(cell);
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

export const when = (ms: number | null | undefined): string => formatDateTime(ms);

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function printResult(io: CliIo, json: boolean, value: unknown, text: string): void {
  io.stdout(`${json ? JSON.stringify(value ?? null) : text}\n`);
}

/** Failures go to stderr in both modes, so stdout only ever carries a result. */
export function printError(io: CliIo, json: boolean, error: ErrorShape): void {
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
  io.stderr(`${lines.join("\n")}\n`);
}
