import { EDITOR_DRAFT_PREFIX, STORAGE_PREFIX } from "@/lib/constants";

/**
 * What this window keeps in web storage: interface preferences (sidebar, view modes, editor
 * layout) and unsaved editor drafts. Both live in the app data folder, not in the library.
 */

const DRAFT_PREFIX = `${STORAGE_PREFIX}${EDITOR_DRAFT_PREFIX}`;

type Area = "preferences" | "drafts";

function areaOf(key: string): Area | null {
  if (key.startsWith(DRAFT_PREFIX)) return "drafts";
  if (key.startsWith(STORAGE_PREFIX)) return "preferences";
  return null;
}

function keysOf(storage: Storage, area: Area): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && areaOf(key) === area) keys.push(key);
  }
  return keys;
}

/** How many entries an area holds; 0 when storage cannot be read. */
export function countStored(area: Area, storage: Storage = window.localStorage): number {
  try {
    return keysOf(storage, area).length;
  } catch {
    return 0;
  }
}

/** Forget an area. Preferences fall back to their defaults on the next render or reload. */
export function clearStored(area: Area, storage: Storage = window.localStorage): number {
  try {
    const keys = keysOf(storage, area);
    for (const key of keys) storage.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}
