import { runsCode, terminalSafe } from "@loadout/shared";
import { outcomeLabel } from "../install-outcome";
import { plural } from "../output";
import { type PickerLine, type PickerState, folderState, outcomesOf, visibleLines } from "./state";

/** ANSI styles; plain text when colour is off (`NO_COLOR`, or not a terminal). */
export interface Styles {
  bold(text: string): string;
  dim(text: string): string;
  accent(text: string): string;
  good(text: string): string;
  info(text: string): string;
  warn(text: string): string;
}

const ESC = "\u001B[";
const wrap =
  (open: number, close: number) =>
  (text: string): string =>
    `${ESC}${open}m${text}${ESC}${close}m`;

export const COLOR_STYLES: Styles = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  accent: wrap(36, 39),
  good: wrap(32, 39),
  info: wrap(34, 39),
  warn: wrap(33, 39),
};

const same = (text: string): string => text;
export const PLAIN_STYLES: Styles = {
  bold: same,
  dim: same,
  accent: same,
  good: same,
  info: same,
  warn: same,
};

const KEY_HELP = "↑↓ move · space tick · a all/none · / filter · enter install · esc cancel";
const FILTER_HELP = "Type to filter · enter keep · esc clear";
const CURSOR = "❯";
const TOP_FOLDER = "(top level)";
/** Lines above and below the list: title, help, filter; the summary. */
const CHROME_LINES = 4;
const MIN_LIST_LINES = 3;
/** Room left for the description after name, box and label. */
const MIN_DESCRIPTION = 12;

/** Cut to `width` visible characters. Only plain text is measured, so cut before styling. */
function fit(raw: string, width: number): string {
  if (width <= 0) return "";
  const text = terminalSafe(raw, { singleLine: true });
  const chars = [...text];
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join("")}…`;
}

function box(state: boolean | "indeterminate"): string {
  if (state === "indeterminate") return "[-]";
  return state ? "[x]" : "[ ]";
}

function skillLine(
  line: Extract<PickerLine, { type: "skill" }>,
  state: PickerState,
  width: number,
  indent: string,
  s: Styles,
): string {
  const { row, outcome } = line;
  const head = `${indent}${box(state.checked.has(row.relPath))} ${row.name}`;
  const label = [
    outcomeLabel(outcome),
    row.manualOnly ? "manual only" : "",
    runsCode(row.traits) ? "runs code" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const labelText = label ? `  ${label}` : "";
  const room = width - [...head].length - [...labelText].length - 2;
  const description =
    row.description && room >= MIN_DESCRIPTION ? `  ${fit(row.description, room)}` : "";
  const plain = fit(`${head}${labelText}${description}`, width);
  // Style only the parts that survived the cut.
  const tone = outcome.kind === "installed" || outcome.kind === "replaces" ? s.info : s.warn;
  const headShown = plain.slice(0, head.length);
  const rest = plain.slice(head.length);
  const labelShown = rest.slice(0, labelText.length);
  return `${headShown}${tone(labelShown)}${s.dim(rest.slice(labelText.length))}`;
}

function folderLine(
  line: Extract<PickerLine, { type: "folder" }>,
  state: PickerState,
  width: number,
  s: Styles,
): string {
  const ticked = line.rows.filter((row) => state.checked.has(row.relPath)).length;
  const text = `${box(folderState(state, line.rows))} ${line.folder || TOP_FOLDER}/`;
  const count = `  ${ticked} of ${line.rows.length}`;
  return `${s.bold(fit(text, width - count.length))}${s.dim(count)}`;
}

/** What is ticked, and how many of those names are in use: the line under the list. */
function summary(state: PickerState): string {
  const ticked = state.checked.size;
  const inUse = [...outcomesOf(state)].filter(
    ([key, outcome]) =>
      state.checked.has(key) && outcome.kind !== "new" && outcome.kind !== "replaces",
  ).length;
  const parts = [`${ticked} of ${state.request.skills.length} ticked`];
  if (inUse > 0) parts.push(`${plural(inUse, "name")} in use`);
  return parts.join(" · ");
}

/** The first visible line, so the cursor stays on screen. */
export function scrollTop(cursor: number, count: number, height: number): number {
  if (count <= height) return 0;
  const top = Math.max(0, cursor - Math.floor(height / 2));
  return Math.min(top, count - height);
}

/** The whole screen as lines, fitted to `columns` × `rows`. */
export function renderPicker(
  state: PickerState,
  columns: number,
  rows: number,
  s: Styles,
): string[] {
  const lines = visibleLines(state);
  const grouped = lines.some((line) => line.type === "folder");
  const title = s.bold(fit(`Choose skills to install from ${state.request.source}`, columns));
  const help = state.message
    ? s.warn(fit(state.message, columns))
    : s.dim(fit(state.filtering ? FILTER_HELP : KEY_HELP, columns));
  const filter =
    state.filtering || state.filter
      ? [fit(`Filter: ${state.filter}${state.filtering ? "▏" : ""}`, columns)]
      : [];
  const height = Math.max(MIN_LIST_LINES, rows - CHROME_LINES);
  const top = scrollTop(state.cursor, lines.length, height);
  const body = lines.slice(top, top + height).map((line, index) => {
    const at = top + index === state.cursor;
    const pointer = at ? s.accent(CURSOR) : " ";
    const width = columns - 2;
    const text =
      line.type === "folder"
        ? folderLine(line, state, width, s)
        : skillLine(line, state, width, grouped ? "  " : "", s);
    return `${pointer} ${text}`;
  });
  if (lines.length === 0) body.push(s.dim(`  No skill matches "${state.filter}".`));
  return [title, help, ...filter, ...body, s.dim(fit(summary(state), columns))];
}
