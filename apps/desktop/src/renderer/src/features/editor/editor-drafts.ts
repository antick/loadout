import { EDITOR_DRAFT_MAX_AGE_MS, EDITOR_DRAFT_PREFIX, STORAGE_PREFIX } from "@/lib/constants";

/**
 * Unsaved editor text kept in localStorage, so closing the window, quitting from the tray or a
 * crash never loses what was typed. A draft remembers the version of the file it started from:
 * if the file changed on disk meanwhile, saving it asks before overwriting.
 */

export interface EditorDraft {
  /** `SkillFile.hash` of the version the edit started from. */
  baseHash: string;
  content: string;
  savedAt: number;
}

function storageKey(draftKey: string, path: string): string {
  return `${STORAGE_PREFIX}${EDITOR_DRAFT_PREFIX}${draftKey}:${path}`;
}

function isDraft(value: unknown): value is EditorDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.baseHash === "string" &&
    typeof draft.content === "string" &&
    typeof draft.savedAt === "number"
  );
}

export function readDraft(draftKey: string, path: string, now = Date.now()): EditorDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(draftKey, path));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isDraft(value) || now - value.savedAt > EDITOR_DRAFT_MAX_AGE_MS) {
      clearDraft(draftKey, path);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeDraft(draftKey: string, path: string, draft: EditorDraft): void {
  try {
    window.localStorage.setItem(storageKey(draftKey, path), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the text is still in the editor for this session.
  }
}

export function clearDraft(draftKey: string, path: string): void {
  try {
    window.localStorage.removeItem(storageKey(draftKey, path));
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

/** Paths of the skill (by location key) that have a stored draft, for the file list dots. */
export function draftPaths(draftKey: string): string[] {
  const prefix = storageKey(draftKey, "");
  const paths: string[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) paths.push(key.slice(prefix.length));
    }
  } catch {
    return [];
  }
  return paths.sort();
}
