import { useEffect, useRef } from "react";

export interface HotkeyOptions {
  /** Require ⌘ on macOS / Ctrl elsewhere. Default true. */
  mod?: boolean;
  shift?: boolean;
  /** Require ⌥ (Alt). The key is then matched by physical key, as ⌥ changes the character. */
  alt?: boolean;
  enabled?: boolean;
  /** Do nothing while a dialog is open, e.g. a shortcut that navigates away from under it. */
  blockedByDialogs?: boolean;
}

type HotkeyEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

/** Does this key press match the shortcut? Without `alt`, a press holding ⌥ never does. */
export function matchesHotkey(
  event: HotkeyEvent,
  key: string,
  { mod = true, shift = false, alt = false }: Pick<HotkeyOptions, "mod" | "shift" | "alt"> = {},
): boolean {
  if (alt) {
    if (!event.altKey || event.code !== `Key${key.toUpperCase()}`) return false;
  } else if (event.altKey || event.key.toLowerCase() !== key.toLowerCase()) return false;
  return mod === (event.metaKey || event.ctrlKey) && shift === event.shiftKey;
}

/** True when the event comes from somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/** True while any modal dialog, sheet or alert is open. */
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/** Window-level keyboard shortcut, e.g. `useHotkey("k", open)` for ⌘K. */
export function useHotkey(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const {
    mod = true,
    shift = false,
    alt = false,
    enabled = true,
    blockedByDialogs = false,
  } = options;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!matchesHotkey(event, key, { mod, shift, alt })) return;
      if (blockedByDialogs && isDialogOpen()) return;
      latest.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod, shift, alt, enabled, blockedByDialogs]);
}
