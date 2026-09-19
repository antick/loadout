import { useCallback, useEffect, useState } from "react";
import { STORAGE_PREFIX } from "@/lib/constants";

function read<T>(storageKey: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** `useState` that survives restarts through localStorage. `key` is prefixed automatically. */
export function usePersistedState<T>(
  key: string,
  fallback: T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => read(storageKey, fallback));

  // A different key means a different stored value; reload instead of carrying the old one over.
  useEffect(() => {
    setValue(read(storageKey, fallback));
    // `fallback` is often an inline literal; re-reading when only it changes would loop.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(previous) : next;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          // Storage can be full or blocked; the in-memory value still works for this session.
        }
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, update];
}
