import { useEffect, useRef } from "react";

export interface HotkeyOptions {
  /** Require ⌘ on macOS / Ctrl elsewhere. Default true. */
  mod?: boolean;
  shift?: boolean;
  /** Require ⌥ (Alt). The key is then matched by physical key, as ⌥ changes the character. */
  alt?: boolean;
  enabled?: boolean;
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
  const { mod = true, shift = false, alt = false, enabled = true } = options;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (alt) {
        if (!event.altKey || event.code !== `Key${key.toUpperCase()}`) return;
      } else if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (mod !== (event.metaKey || event.ctrlKey)) return;
      if (shift !== event.shiftKey) return;
      latest.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod, shift, alt, enabled]);
}
