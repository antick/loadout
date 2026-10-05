import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDialogOpen, isTypingTarget } from "@/hooks/use-hotkey";

export interface Selection {
  /** Selection mode is on (checkboxes visible). */
  active: boolean;
  selectedIds: string[];
  count: number;
  allSelected: boolean;
  isSelected(id: string): boolean;
  /** Toggle one id. With `shiftKey`, select the whole range from the last toggled id instead. */
  toggle(id: string, modifiers?: { shiftKey?: boolean }): void;
  /** Select every id in the current (filtered) list. */
  selectAll(): void;
  /** Untick every id in the current (filtered) list; ticks kept outside it stay. */
  deselectAll(): void;
  /** Select exactly these ids (those in the list). */
  select(ids: readonly string[]): void;
  clear(): void;
  enter(): void;
  exit(): void;
}

export interface SelectionOptions {
  /**
   * Every id a tick may belong to, shown or not. Ticks survive filtering as long as their id is
   * here; only ids that leave it are pruned. Defaults to the ordered list itself, so a filtered-out
   * id is unticked.
   */
  keepIds?: readonly string[];
}

const EMPTY: ReadonlySet<string> = new Set();
const ID_SEPARATOR = "\u0000";

/** The ticks whose id is still in `keep`; the same set when none had to go. */
export function pruneSelected(
  selected: ReadonlySet<string>,
  keep: readonly string[],
): ReadonlySet<string> {
  if (selected.size === 0) return selected;
  const kept = new Set(keep);
  const next = [...selected].filter((id) => kept.has(id));
  return next.length === selected.size ? selected : new Set(next);
}

/** One click: toggle `id`, or with shift add the range of `orderedIds` from `anchor` to it. */
export function toggledSelection(
  selected: ReadonlySet<string>,
  orderedIds: readonly string[],
  anchor: string | null,
  id: string,
  shiftKey = false,
): ReadonlySet<string> {
  const next = new Set(selected);
  const from = anchor === null ? -1 : orderedIds.indexOf(anchor);
  const to = orderedIds.indexOf(id);
  if (shiftKey && from !== -1 && to !== -1) {
    for (const rangeId of orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      next.add(rangeId);
    }
  } else if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Tick (or untick) every shown id, keeping ticks outside the shown list as they are. */
export function withShown(
  selected: ReadonlySet<string>,
  shownIds: readonly string[],
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(selected);
  for (const id of shownIds) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * Multi-select over an ordered, already filtered id list. Ids that drop out of the list are
 * pruned (or, with `keepIds`, only those that drop out of it), shift-click selects a range, and
 * Escape leaves selection mode unless the user is typing or a dialog is open.
 */
export function useSelection(
  orderedIds: readonly string[],
  options: SelectionOptions = {},
): Selection {
  const keepIds = options.keepIds ?? orderedIds;
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  const anchor = useRef<string | null>(null);

  // Prune while rendering (not in an effect) so a filtered-out id never shows up as selected.
  // Compared by content, so callers that build the array inline do not trigger a render loop.
  const idsKey = keepIds.join(ID_SEPARATOR);
  const [seenKey, setSeenKey] = useState(idsKey);
  if (seenKey !== idsKey) {
    setSeenKey(idsKey);
    const kept = pruneSelected(selected, keepIds);
    if (kept !== selected) setSelected(kept);
  }

  const exit = useCallback(() => {
    setActive(false);
    setSelected(EMPTY);
    anchor.current = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || isTypingTarget(event.target) || isDialogOpen()) return;
      exit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, exit]);

  const toggle = useCallback(
    (id: string, modifiers?: { shiftKey?: boolean }) => {
      setActive(true);
      const from = anchor.current;
      setSelected((previous) =>
        toggledSelection(previous, orderedIds, from, id, modifiers?.shiftKey),
      );
      anchor.current = id;
    },
    [orderedIds],
  );

  const selectAll = useCallback(() => {
    setActive(true);
    setSelected((previous) => withShown(previous, orderedIds, true));
  }, [orderedIds]);

  const deselectAll = useCallback(() => {
    setSelected((previous) => withShown(previous, orderedIds, false));
    anchor.current = null;
  }, [orderedIds]);

  const select = useCallback(
    (ids: readonly string[]) => {
      const inList = new Set(keepIds);
      setActive(true);
      setSelected(new Set(ids.filter((id) => inList.has(id))));
    },
    [keepIds],
  );

  const clear = useCallback(() => {
    setSelected(EMPTY);
    anchor.current = null;
  }, []);

  const enter = useCallback(() => setActive(true), []);

  return useMemo(
    () => ({
      active,
      selectedIds: keepIds.filter((id) => selected.has(id)),
      count: selected.size,
      allSelected: orderedIds.length > 0 && orderedIds.every((id) => selected.has(id)),
      isSelected: (id: string) => selected.has(id),
      toggle,
      selectAll,
      deselectAll,
      select,
      clear,
      enter,
      exit,
    }),
    [
      active,
      selected,
      orderedIds,
      keepIds,
      toggle,
      selectAll,
      deselectAll,
      select,
      clear,
      enter,
      exit,
    ],
  );
}
