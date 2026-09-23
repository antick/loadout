import type { Platform } from "@loadout/shared";

/** Keys of the app-wide shortcuts. All use ⌘ on macOS and Ctrl elsewhere. */
export const SHORTCUT_KEYS = {
  palette: "k",
  quickOpen: "p",
  find: "f",
  sidebar: "b",
  settings: ",",
  save: "s",
  editorView: "\\",
  sectionHome: "1",
  sectionLibrary: "2",
  sectionAgents: "3",
  sectionPresets: "4",
  sectionProjects: "5",
} as const;

/**
 * Shortcuts on ⌥ (Alt) instead of ⌘. Matched by physical key, because ⌥ changes the character a
 * key types on macOS (⌥Z types "Ω").
 */
export const ALT_SHORTCUT_KEYS = {
  editorWrap: "z",
} as const;

export type ShortcutId = keyof typeof SHORTCUT_KEYS | keyof typeof ALT_SHORTCUT_KEYS | "escape";

const MAC_MOD = "⌘";
const OTHER_MOD = "Ctrl+";
const MAC_ALT = "⌥";
const OTHER_ALT = "Alt+";
const ESCAPE_LABEL = "Esc";

/** "⌘K" on macOS, "Ctrl+K" elsewhere; "⌥Z" and "Alt+Z" for the ⌥ shortcuts. */
export function shortcutLabel(id: ShortcutId, platform: Platform | undefined): string {
  if (id === "escape") return ESCAPE_LABEL;
  const mac = platform === "darwin" || platform === undefined;
  if (id in ALT_SHORTCUT_KEYS) {
    const key = ALT_SHORTCUT_KEYS[id as keyof typeof ALT_SHORTCUT_KEYS];
    return `${mac ? MAC_ALT : OTHER_ALT}${key.toUpperCase()}`;
  }
  return `${mac ? MAC_MOD : OTHER_MOD}${SHORTCUT_KEYS[id as keyof typeof SHORTCUT_KEYS].toUpperCase()}`;
}
