import { type FileSession, isDirty } from "@/features/editor/editor-session";
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

/** False when storage is full or blocked: the text is then only in the editor, nowhere else. */
export function writeDraft(draftKey: string, path: string, draft: EditorDraft): boolean {
  try {
    window.localStorage.setItem(storageKey(draftKey, path), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(draftKey: string, path: string): void {
  try {
    window.localStorage.removeItem(storageKey(draftKey, path));
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

/**
 * Make storage match the open files: an unsaved file keeps its draft, a saved one loses it, so
 * an old draft can never come back over a save. False when a draft could not be stored.
 */
export function storeDrafts(
  draftKey: string,
  sessions: Iterable<FileSession>,
  now = Date.now(),
): boolean {
  let stored = true;
  for (const session of sessions) {
    if (!isDirty(session)) {
      clearDraft(draftKey, session.path);
      continue;
    }
    const draft = { baseHash: session.baseHash, content: session.draft, savedAt: now };
    if (!writeDraft(draftKey, session.path, draft)) stored = false;
  }
  return stored;
}

/** Every localStorage key that starts with `prefix`, collected before any is removed. */
function keysStartingWith(prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/**
 * Paths of the skill (by location key) that have a stored draft, for the file list dots. An
 * expired draft is removed here rather than listed.
 */
export function draftPaths(draftKey: string, now = Date.now()): string[] {
  const prefix = storageKey(draftKey, "");
  return keysStartingWith(prefix)
    .map((key) => key.slice(prefix.length))
    .filter((path) => readDraft(draftKey, path, now) !== null)
    .sort();
}

/**
 * Remove expired or unreadable drafts of every location, also those of skills, projects or files
 * that are gone and so never opened again. Run once at start.
 */
export function pruneDrafts(now = Date.now()): void {
  for (const key of keysStartingWith(`${STORAGE_PREFIX}${EDITOR_DRAFT_PREFIX}`)) {
    try {
      const raw = window.localStorage.getItem(key);
      const value: unknown = raw === null ? null : JSON.parse(raw);
      if (isDraft(value) && now - value.savedAt <= EDITOR_DRAFT_MAX_AGE_MS) continue;
    } catch {
      // Not JSON: not a draft this version can use.
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up when storage is unavailable.
    }
  }
}
