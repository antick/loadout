import { describe, expect, it } from "vitest";
import { EDITOR_DRAFT_PREFIX, STORAGE_PREFIX } from "@/lib/constants";
import { clearStored, countStored } from "@/lib/interface-state";

/** A minimal in-memory `Storage`. */
function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

describe("interface state", () => {
  const storage = () =>
    memoryStorage({
      [`${STORAGE_PREFIX}sidebar.width`]: "300",
      [`${STORAGE_PREFIX}view-mode:library`]: '"list"',
      [`${STORAGE_PREFIX}${EDITOR_DRAFT_PREFIX}library:a:SKILL.md`]: "{}",
      "someone-else": "keep",
    });

  it("counts preferences and drafts apart", () => {
    const store = storage();
    expect(countStored("preferences", store)).toBe(2);
    expect(countStored("drafts", store)).toBe(1);
  });

  it("clears one area and leaves the other and foreign keys alone", () => {
    const store = storage();
    expect(clearStored("preferences", store)).toBe(2);
    expect(countStored("drafts", store)).toBe(1);
    expect(store.getItem("someone-else")).toBe("keep");
  });
});
