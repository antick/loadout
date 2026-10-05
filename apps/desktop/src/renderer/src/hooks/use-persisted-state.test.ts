import { describe, expect, it } from "vitest";
import { createPersistedStore, MISSING } from "@/hooks/use-persisted-state";

/** A minimal in-memory `Storage`; `full` makes every write throw. */
function memoryStorage(entries: Record<string, string> = {}, full = false): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (full) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

const KEY = "loadout:sidebar.groups";

describe("persisted state store", () => {
  it("reads what earlier versions saved", () => {
    const storage = memoryStorage({ [KEY]: '{"library":false}' });
    const store = createPersistedStore(() => storage);
    expect(store.read(KEY)).toEqual({ library: false });
    // The same object every time until it changes, as useSyncExternalStore needs.
    expect(store.read(KEY)).toBe(store.read(KEY));
    expect(store.read("loadout:other")).toBe(MISSING);
  });

  it("gives every reader of a key the latest write, so one group never undoes another", () => {
    const storage = memoryStorage();
    const store = createPersistedStore(() => storage);
    const heard: string[] = [];
    store.subscribe(KEY, () => heard.push("library group"));
    store.subscribe(KEY, () => heard.push("tags group"));
    store.subscribe("loadout:other", () => heard.push("other key"));

    store.write(KEY, { library: false });
    // The tags group folds next, starting from what is stored now rather than its own copy.
    store.write(KEY, { ...(store.read(KEY) as object), tags: false });

    expect(store.read(KEY)).toEqual({ library: false, tags: false });
    expect(heard).toEqual(["library group", "tags group", "library group", "tags group"]);
  });

  it("keeps a value storage refused for the rest of the session", () => {
    const storage = memoryStorage({}, true);
    const store = createPersistedStore(() => storage);
    store.write(KEY, { library: true });
    expect(store.read(KEY)).toEqual({ library: true });
  });

  it("tells readers when another window changed the key", () => {
    const storage = memoryStorage();
    const store = createPersistedStore(() => storage);
    let heard = 0;
    store.subscribe(KEY, () => (heard += 1));
    storage.setItem(KEY, "true");
    store.changedElsewhere(KEY);
    expect(heard).toBe(1);
    expect(store.read(KEY)).toBe(true);
  });
});
