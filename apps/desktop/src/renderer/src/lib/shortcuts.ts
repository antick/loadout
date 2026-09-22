import type { Platform } from "@loadout/shared";

/** Keys of the app-wide shortcuts. All use ⌘ on macOS and Ctrl elsewhere, except `escape`. */
export const SHORTCUT_KEYS = {
  palette: "k",
  find: "f",
  sidebar: "b",
  settings: ",",
  save: "s",
  sectionLibrary: "1",
  sectionAgents: "2",
  sectionPresets: "3",
  sectionProjects: "4",
} as const;

export type ShortcutId = keyof typeof SHORTCUT_KEYS | "escape";

const MAC_MOD = "⌘";
const OTHER_MOD = "Ctrl+";
const ESCAPE_LABEL = "Esc";

/** "⌘K" on macOS, "Ctrl+K" elsewhere. */
export function shortcutLabel(id: ShortcutId, platform: Platform | undefined): string {
  if (id === "escape") return ESCAPE_LABEL;
  const mod = platform === "darwin" || platform === undefined ? MAC_MOD : OTHER_MOD;
  return `${mod}${SHORTCUT_KEYS[id].toUpperCase()}`;
}
