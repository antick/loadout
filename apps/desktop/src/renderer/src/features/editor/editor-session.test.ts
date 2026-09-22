import type { SkillFile } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import {
  afterSave,
  applyDiskVersion,
  hasDiskChange,
  isDirty,
  keepMine,
  openSession,
  revertToDisk,
  withDraft,
} from "./editor-session";

const file = (content: string, hash = `hash-of-${content}`): SkillFile => ({
  path: "SKILL.md",
  content,
  hash,
  eol: "lf",
  modifiedAt: 0,
});

describe("opening a file", () => {
  it("starts clean", () => {
    const session = openSession(file("one"), null);
    expect(isDirty(session)).toBe(false);
    expect(hasDiskChange(session)).toBe(false);
    expect(session.restored).toBe(false);
  });

  it("brings back a draft of the same version", () => {
    const disk = file("one");
    const session = openSession(disk, { baseHash: disk.hash, content: "mine", savedAt: 1 });
    expect(session).toMatchObject({ draft: "mine", baseHash: disk.hash, restored: true });
    expect(isDirty(session)).toBe(true);
    expect(hasDiskChange(session)).toBe(false);
  });

  it("flags a draft whose file changed since", () => {
    const session = openSession(file("two"), { baseHash: "old", content: "mine", savedAt: 1 });
    expect(isDirty(session)).toBe(true);
    expect(hasDiskChange(session)).toBe(true);
  });

  it("ignores a draft that matches the file", () => {
    const disk = file("same");
    expect(openSession(disk, { baseHash: "old", content: "same", savedAt: 1 }).restored).toBe(
      false,
    );
  });
});

describe("a newer version on disk", () => {
  it("replaces unedited text", () => {
    const next = applyDiskVersion(openSession(file("one"), null), file("two"));
    expect(next).toMatchObject({ draft: "two", baseContent: "two", baseHash: "hash-of-two" });
    expect(hasDiskChange(next)).toBe(false);
  });

  it("never replaces an edit, and says so", () => {
    const editing = withDraft(openSession(file("one"), null), "mine");
    const next = applyDiskVersion(editing, file("two"));
    expect(next.draft).toBe("mine");
    expect(next.baseHash).toBe("hash-of-one");
    expect(hasDiskChange(next)).toBe(true);
  });

  it("settles quietly when the disk now holds the edit", () => {
    const editing = withDraft(openSession(file("one"), null), "mine");
    const next = applyDiskVersion(editing, file("mine"));
    expect(isDirty(next)).toBe(false);
    expect(hasDiskChange(next)).toBe(false);
  });
});

describe("resolving", () => {
  const conflicted = () =>
    applyDiskVersion(withDraft(openSession(file("one"), null), "mine"), file("two"));

  it("keeps mine: the next save is based on the disk version", () => {
    const next = keepMine(conflicted());
    expect(next).toMatchObject({ draft: "mine", baseHash: "hash-of-two" });
    expect(isDirty(next)).toBe(true);
    expect(hasDiskChange(next)).toBe(false);
  });

  it("reverts to the disk version", () => {
    const next = revertToDisk(conflicted());
    expect(next).toMatchObject({ draft: "two", baseHash: "hash-of-two" });
    expect(isDirty(next)).toBe(false);
  });

  it("after a save, typing done meanwhile stays unsaved", () => {
    const saving = withDraft(openSession(file("one"), null), "saved text");
    const typedMore = withDraft(saving, "saved text and more");
    const next = afterSave(typedMore, file("saved text"));
    expect(next.baseHash).toBe("hash-of-saved text");
    expect(isDirty(next)).toBe(true);
    expect(hasDiskChange(next)).toBe(false);
  });
});
