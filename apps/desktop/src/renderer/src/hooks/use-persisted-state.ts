import { useCallback, useSyncExternalStore } from "react";
import { STORAGE_PREFIX } from "@/lib/constants";

/** What `read` gives for a key with nothing stored (or nothing readable): use the fallback. */
export const MISSING: unique symbol = Symbol("missing");

type Listener = () => void;

export interface PersistedStore {
  /** The stored value, parsed once per change so every reader gets the same object. */
  read(storageKey: string): unknown;
  write(storageKey: string, value: unknown): void;
  /** Called after every write to this key, here or (through `storage` events) in another window. */
  subscribe(storageKey: string, listener: Listener): () => void;
  /** Another window changed this key (null: cleared everything); tell its readers. */
  changedElsewhere(storageKey: string | null): void;
}

/**
 * One value per localStorage key, shared by every component that uses the key, so a write by one
 * is what the others read. A value that cannot be written (storage full or blocked) still holds
 * for this session.
 */
export function createPersistedStore(storage: () => Storage): PersistedStore {
  const listeners = new Map<string, Set<Listener>>();
  const parsed = new Map<string, { raw: string | null; value: unknown }>();
  const unsaved = new Map<string, string>();

  const rawOf = (storageKey: string): string | null => {
    const held = unsaved.get(storageKey);
    if (held !== undefined) return held;
    try {
      return storage().getItem(storageKey);
    } catch {
      return null;
    }
  };

  const notify = (storageKey: string): void => {
    for (const listener of listeners.get(storageKey) ?? []) listener();
  };

  return {
    read(storageKey) {
      const raw = rawOf(storageKey);
      const cached = parsed.get(storageKey);
      if (cached && cached.raw === raw) return cached.value;
      let value: unknown = MISSING;
      try {
        if (raw !== null) value = JSON.parse(raw);
      } catch {
        // A value that is not JSON (written by hand, or by an old version) counts as unset.
      }
      parsed.set(storageKey, { raw, value });
      return value;
    },

    write(storageKey, value) {
      const raw = JSON.stringify(value);
      try {
        storage().setItem(storageKey, raw);
        unsaved.delete(storageKey);
      } catch {
        unsaved.set(storageKey, raw);
      }
      notify(storageKey);
    },

    subscribe(storageKey, listener) {
      let set = listeners.get(storageKey);
      if (!set) {
        set = new Set();
        listeners.set(storageKey, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(storageKey);
      };
    },

    changedElsewhere(storageKey) {
      if (storageKey === null) {
        unsaved.clear();
        for (const key of listeners.keys()) notify(key);
        return;
      }
      unsaved.delete(storageKey);
      notify(storageKey);
    },
  };
}

const store = createPersistedStore(() => window.localStorage);
let listeningToOtherWindows = false;

function subscribeTo(storageKey: string, listener: Listener): () => void {
  if (!listeningToOtherWindows) {
    listeningToOtherWindows = true;
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) {
        store.changedElsewhere(event.key);
      }
    });
  }
  return store.subscribe(storageKey, listener);
}

/**
 * `useState` that survives restarts through localStorage. `key` is prefixed automatically. Every
 * component using the same key shares one value.
 */
export function usePersistedState<T>(
  key: string,
  fallback: T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const subscribe = useCallback(
    (listener: Listener) => subscribeTo(storageKey, listener),
    [storageKey],
  );
  const stored = useSyncExternalStore(subscribe, () => store.read(storageKey));
  const value = stored === MISSING ? fallback : (stored as T);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      // Read at call time, not from this render, so two quick updates both count.
      const current = store.read(storageKey);
      const previous = current === MISSING ? fallback : (current as T);
      const resolved = typeof next === "function" ? (next as (p: T) => T)(previous) : next;
      store.write(storageKey, resolved);
    },
    // `fallback` is often an inline literal; it only matters while nothing is stored.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  return [value, update];
}
