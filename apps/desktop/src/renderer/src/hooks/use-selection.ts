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
  clear(): void;
  enter(): void;
  exit(): void;
}

const EMPTY: ReadonlySet<string> = new Set();
const ID_SEPARATOR = "\u0000";

/**
 * Multi-select over an ordered, already filtered id list. Ids that drop out of the list are
 * pruned, shift-click selects a range, and Escape leaves selection mode unless the user is typing
 * or a dialog is open.
 */
export function useSelection(orderedIds: readonly string[]): Selection {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  const anchor = useRef<string | null>(null);

  // Prune while rendering (not in an effect) so a filtered-out id never shows up as selected.
  // Compared by content, so callers that build the array inline do not trigger a render loop.
  const idsKey = orderedIds.join(ID_SEPARATOR);
  const [seenKey, setSeenKey] = useState(idsKey);
  if (seenKey !== idsKey) {
    setSeenKey(idsKey);
    if (selected.size > 0) {
      const visible = new Set(orderedIds);
      const kept = [...selected].filter((id) => visible.has(id));
      if (kept.length !== selected.size) setSelected(new Set(kept));
    }
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
      setSelected((previous) => {
        const next = new Set(previous);
        const from = anchor.current === null ? -1 : orderedIds.indexOf(anchor.current);
        const to = orderedIds.indexOf(id);
        if (modifiers?.shiftKey && from !== -1 && to !== -1) {
          for (const rangeId of orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            next.add(rangeId);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [orderedIds],
  );

  const selectAll = useCallback(() => {
    setActive(true);
    setSelected(new Set(orderedIds));
  }, [orderedIds]);

  const clear = useCallback(() => {
    setSelected(EMPTY);
    anchor.current = null;
  }, []);

  const enter = useCallback(() => setActive(true), []);

  return useMemo(
    () => ({
      active,
      selectedIds: orderedIds.filter((id) => selected.has(id)),
      count: selected.size,
      allSelected: orderedIds.length > 0 && selected.size === orderedIds.length,
      isSelected: (id: string) => selected.has(id),
      toggle,
      selectAll,
      clear,
      enter,
      exit,
    }),
    [active, selected, orderedIds, toggle, selectAll, clear, enter, exit],
  );
}
