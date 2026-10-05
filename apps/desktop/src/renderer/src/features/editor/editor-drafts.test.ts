import type { SkillFile } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftPaths, readDraft, storeDrafts, writeDraft } from "./editor-drafts";
import { afterSave, openSession, withDraft } from "./editor-session";

const KEY = "library:skill";
const NOW = 1_000;

const file = (path: string, content: string): SkillFile => ({
  path,
  content,
  hash: `hash-of-${content}`,
  eol: "lf",
  modifiedAt: 0,
});

/** A Storage on a Map; `full` makes every write throw, as a full or blocked one does. */
function memoryStorage(): Storage & { full: boolean } {
  const items = new Map<string, string>();
  return {
    full: false,
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      if (this.full) throw new Error("QuotaExceededError");
      items.set(key, value);
    },
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storing drafts", () => {
  it("keeps unsaved files and drops saved ones, so a saved file shows no draft later", () => {
    const skill = withDraft(openSession(file("SKILL.md", "one"), null), "edited");
    const reference = withDraft(openSession(file("reference.md", "two"), null), "edited too");
    expect(storeDrafts(KEY, [skill, reference], NOW)).toBe(true);
    expect(draftPaths(KEY)).toEqual(["SKILL.md", "reference.md"]);

    // Both saved: the very next pass leaves nothing behind for either file.
    const saved = [
      afterSave(skill, file("SKILL.md", "edited")),
      afterSave(reference, file("reference.md", "edited too")),
    ];
    expect(storeDrafts(KEY, saved, NOW)).toBe(true);
    expect(draftPaths(KEY)).toEqual([]);
  });

  it("stores typing done during a save on the saved version, not the old one", () => {
    const editing = withDraft(openSession(file("SKILL.md", "one"), null), "first");
    storeDrafts(KEY, [editing], NOW);
    const typedMore = withDraft(editing, "first and more");
    storeDrafts(KEY, [afterSave(typedMore, file("SKILL.md", "first"))], NOW);
    expect(readDraft(KEY, "SKILL.md", NOW)).toEqual({
      baseHash: "hash-of-first",
      content: "first and more",
      savedAt: NOW,
    });
  });

  it("says when a draft could not be stored", () => {
    storage.full = true;
    const editing = withDraft(openSession(file("SKILL.md", "one"), null), "edited");
    expect(writeDraft(KEY, "SKILL.md", { baseHash: "h", content: "x", savedAt: NOW })).toBe(false);
    expect(storeDrafts(KEY, [editing], NOW)).toBe(false);
    // Nothing unsaved: nothing to lose.
    expect(storeDrafts(KEY, [openSession(file("SKILL.md", "one"), null)], NOW)).toBe(true);
  });
});
