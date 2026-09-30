/**
 * Code editors Loadout can open a skill, a file or a folder in. The desktop app looks for them on
 * this computer; the `defaultEditor` setting names the one the "Open in editor" buttons use, or
 * is empty for the system's default app.
 */

export const EDITOR_IDS = ["vscode", "cursor", "windsurf", "zed", "sublime"] as const;
export type EditorId = (typeof EDITOR_IDS)[number];

/** The system's default app for the path, whatever it is. */
export const SYSTEM_EDITOR = "system";
export type EditorChoice = EditorId | typeof SYSTEM_EDITOR;

export const EDITOR_NAMES: Record<EditorId, string> = {
  vscode: "Visual Studio Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  zed: "Zed",
  sublime: "Sublime Text",
};

/** An editor found on this computer. */
export interface DetectedEditor {
  id: EditorId;
  name: string;
}

export function isEditorId(value: unknown): value is EditorId {
  return EDITOR_IDS.some((id) => id === value);
}

/**
 * The editor the "Open in editor" buttons use: the chosen one while it is found, otherwise the
 * system default. `name` is null for the system default.
 */
export function resolveEditor(
  setting: string,
  detected: readonly DetectedEditor[],
): { id: EditorChoice; name: string | null } {
  const chosen = detected.find((editor) => editor.id === setting);
  return chosen ? { id: chosen.id, name: chosen.name } : { id: SYSTEM_EDITOR, name: null };
}
