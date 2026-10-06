import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isPlainName,
  isReallyInside,
  isSafeRelativePath,
  isSkillFolderName,
  resolveInside,
} from "../src/util/safe-path";
import { tempDir } from "./helpers";

describe("names and paths from outside", () => {
  it("takes one plain name, never a way out", () => {
    for (const good of ["pdf", "My Skill", ".hidden", "a.b"]) expect(isPlainName(good)).toBe(true);
    for (const bad of ["", ".", "..", "a/b", "a\\b", "a\0b", 7, null]) {
      expect(isPlainName(bad), String(bad)).toBe(false);
    }
  });

  it("takes a skill folder name only when it is plain and not hidden", () => {
    expect(isSkillFolderName("My Skill")).toBe(true);
    expect(isSkillFolderName(".loadout")).toBe(false);
    expect(isSkillFolderName("../x")).toBe(false);
  });

  it("takes a relative path whose every part is plain", () => {
    expect(isSafeRelativePath("scripts/run.sh")).toBe(true);
    for (const bad of ["", "/etc/passwd", "a//b", "a/../b", "./a", "C:/x", "a\\b", "a/\0"]) {
      expect(isSafeRelativePath(bad), bad).toBe(false);
    }
  });

  it("resolves inside a root, either separator, refusing a way out", () => {
    expect(resolveInside("/root", "a\\b")).toBe(join("/root", "a", "b"));
    expect(() => resolveInside("/root", "../x")).toThrow();
    expect(() => resolveInside("/root", "")).toThrow();
  });
});

describe("isReallyInside", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("follows links, even on the way to a path that does not exist yet", () => {
    const root = join(temp.dir, "root");
    const outside = join(temp.dir, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    symlinkSync(outside, join(root, "door"));
    expect(isReallyInside(root, join(root, "new", "file"))).toBe(true);
    expect(isReallyInside(root, join(root, "door", "file"))).toBe(false);
    expect(isReallyInside(root, join(root, "door"))).toBe(false);
  });
});
