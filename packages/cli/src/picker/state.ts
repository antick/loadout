import {
  type InstallOutcome,
  type LibraryNameEntry,
  type RepoSkillPreview,
  filterPreviewRows,
  groupPreviewRows,
  groupState,
  initialSelection,
  planInstallNames,
  showsGroups,
} from "@loadout/shared";

/** What the picker is asked to choose from: the skills of one import preview. */
export interface PickRequest {
  /** The source, shown in the title. */
  source: string;
  skills: readonly RepoSkillPreview[];
  library: readonly LibraryNameEntry[];
  /** What the typed text named; null ticks the free names, as the app does. */
  selected: readonly string[] | null;
  /** `--replace`: a name held by a library skill replaces it instead of getting a number. */
  replace?: boolean;
}

/** A chosen list of preview keys, or null when the person cancelled. */
export type SkillPicker = (request: PickRequest) => Promise<string[] | null>;

/** One line of the list: a folder heading (when the skills sit in several) or a skill. */
export type PickerLine =
  | { type: "folder"; folder: string; rows: RepoSkillPreview[] }
  | { type: "skill"; row: RepoSkillPreview; outcome: InstallOutcome };

export interface PickerState {
  request: PickRequest;
  checked: ReadonlySet<string>;
  /** Index into the visible lines. */
  cursor: number;
  filter: string;
  /** Typing goes into the filter. */
  filtering: boolean;
  /** Shown instead of the key help for one key press, e.g. "Tick at least one skill". */
  message: string | null;
}

/** A key press as Node's `readline` reports it. */
export interface PickerKey {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

export type PickerStep =
  | { type: "continue"; state: PickerState }
  | { type: "confirm"; keys: string[] }
  | { type: "cancel" };

export const NOTHING_TICKED = "Tick at least one skill, or press Esc to cancel.";
/** Lines one Page Up / Page Down moves. */
const PAGE_LINES = 10;
const PRINTABLE = /^[\p{L}\p{N}\p{P}\p{S} ]$/u;

export function createPickerState(request: PickRequest): PickerState {
  const outcomes = planInstallNames(
    request.skills.map((row) => row.name),
    request.library,
    undefined,
    request.skills.map(() => request.replace === true),
  );
  return {
    request,
    checked: initialSelection(
      { skills: [...request.skills], selected: request.selected ? [...request.selected] : null },
      outcomes,
    ),
    cursor: 0,
    filter: "",
    filtering: false,
    message: null,
  };
}

/** Outcomes of every skill with the current ticks: an unticked skill claims no name. */
export function outcomesOf(state: PickerState): Map<string, InstallOutcome> {
  const { skills, library, replace } = state.request;
  const planned = planInstallNames(
    skills.map((row) => row.name),
    library,
    skills.map((row) => state.checked.has(row.relPath)),
    skills.map(() => replace === true),
  );
  return new Map(
    skills.flatMap((row, index) => {
      const outcome = planned[index];
      return outcome ? [[row.relPath, outcome] as const] : [];
    }),
  );
}

/** The lines on screen: folder headings only when the skills sit in more than one folder. */
export function visibleLines(state: PickerState): PickerLine[] {
  const outcomes = outcomesOf(state);
  const shown = filterPreviewRows(state.request.skills, state.filter);
  const skillLine = (row: RepoSkillPreview): PickerLine[] => {
    const outcome = outcomes.get(row.relPath);
    return outcome ? [{ type: "skill", row, outcome }] : [];
  };
  const groups = groupPreviewRows(shown);
  if (!showsGroups(groupPreviewRows(state.request.skills))) return shown.flatMap(skillLine);
  const lines: PickerLine[] = [];
  for (const group of groups) {
    lines.push({ type: "folder", folder: group.folder, rows: group.rows });
    lines.push(...group.rows.flatMap(skillLine));
  }
  return lines;
}

/** Ticked, partly ticked or not, for a folder heading. */
export function folderState(
  state: PickerState,
  rows: readonly RepoSkillPreview[],
): boolean | "indeterminate" {
  return groupState(rows, state.checked);
}

function withTicks(
  state: PickerState,
  rows: readonly RepoSkillPreview[],
  tick: boolean,
): PickerState {
  const checked = new Set(state.checked);
  for (const row of rows) {
    if (tick) checked.add(row.relPath);
    else checked.delete(row.relPath);
  }
  return { ...state, checked };
}

function clampCursor(state: PickerState): PickerState {
  const count = visibleLines(state).length;
  return { ...state, cursor: Math.max(0, Math.min(state.cursor, count - 1)) };
}

function toggleAtCursor(state: PickerState): PickerState {
  const line = visibleLines(state)[state.cursor];
  if (!line) return state;
  if (line.type === "folder")
    return withTicks(state, line.rows, folderState(state, line.rows) !== true);
  return withTicks(state, [line.row], !state.checked.has(line.row.relPath));
}

/** Select all / none, over what the filter shows. */
function toggleAll(state: PickerState): PickerState {
  const shown = filterPreviewRows(state.request.skills, state.filter);
  const all = shown.length > 0 && shown.every((row) => state.checked.has(row.relPath));
  return withTicks(state, shown, !all);
}

function confirm(state: PickerState): PickerStep {
  // In the order the source lists them, whatever order they were ticked in.
  const keys = state.request.skills
    .map((row) => row.relPath)
    .filter((key) => state.checked.has(key));
  if (keys.length === 0) return { type: "continue", state: { ...state, message: NOTHING_TICKED } };
  return { type: "confirm", keys };
}

function filterKey(state: PickerState, key: PickerKey): PickerState {
  if (key.name === "escape") return clampCursor({ ...state, filter: "", filtering: false });
  if (key.name === "return" || key.name === "enter") return { ...state, filtering: false };
  if (key.name === "backspace") return clampCursor({ ...state, filter: state.filter.slice(0, -1) });
  const text = key.sequence ?? "";
  if (!key.ctrl && PRINTABLE.test(text)) {
    return clampCursor({ ...state, filter: state.filter + text, cursor: 0 });
  }
  return state;
}

function move(state: PickerState, by: number): PickerState {
  return clampCursor({ ...state, cursor: state.cursor + by });
}

const next = (state: PickerState): PickerStep => ({ type: "continue", state });

/** What one key press does. Pure: the terminal driver draws the state it returns. */
export function pickerStep(current: PickerState, key: PickerKey): PickerStep {
  const state = { ...current, message: null };
  if (key.ctrl && key.name === "c") return { type: "cancel" };
  if (state.filtering && !["up", "down", "pageup", "pagedown"].includes(key.name ?? "")) {
    return { type: "continue", state: filterKey(state, key) };
  }
  switch (key.name) {
    case "up":
    case "k":
      return next(move(state, -1));
    case "down":
    case "j":
      return next(move(state, 1));
    case "pageup":
      return next(move(state, -PAGE_LINES));
    case "pagedown":
      return next(move(state, PAGE_LINES));
    case "home":
      return next({ ...state, cursor: 0 });
    case "end":
      return next(move(state, Number.MAX_SAFE_INTEGER));
    case "space":
      return next(toggleAtCursor(state));
    case "a":
      return next(toggleAll(state));
    case "return":
    case "enter":
      return confirm(state);
    case "escape":
    case "q":
      return { type: "cancel" };
    default:
      return key.sequence === "/" ? next({ ...state, filtering: true }) : next(state);
  }
}
