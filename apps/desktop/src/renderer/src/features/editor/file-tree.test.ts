import type { SkillFileEntry } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import {
  groupByFolder,
  isWithin,
  movedPath,
  normalizePath,
  pathProblem,
  takenPaths,
} from "./file-tree";

const entry = (path: string, main = false): SkillFileEntry => ({
  path,
  size: 1,
  locked: null,
  main,
  edited: false,
});

describe("file tree paths", () => {
  it("groups files under their folders, with empty folders and without the main document", () => {
    const files = [entry("SKILL.md", true), entry("a.md"), entry("scripts/run.sh")];
    expect(groupByFolder(files, ["assets", "scripts"])).toEqual([
      { folder: "", files: [entry("a.md")] },
      { folder: "assets", files: [] },
      { folder: "scripts", files: [entry("scripts/run.sh")] },
    ]);
  });

  it("follows a rename into folders, and only there", () => {
    expect(movedPath("docs/a.md", "docs", "guide")).toBe("guide/a.md");
    expect(movedPath("a.md", "a.md", "b.md")).toBe("b.md");
    expect(movedPath("docs2/a.md", "docs", "guide")).toBeNull();
    expect(isWithin("docs", "docs")).toBe(true);
  });

  it("reads typed paths like core does and says what is wrong with them", () => {
    expect(normalizePath(" docs\\\\notes.md ")).toBe("docs/notes.md");
    const taken = takenPaths([entry("SKILL.md", true), entry("docs/a.md")], ["empty"]);
    expect([...taken].sort()).toEqual(["docs", "docs/a.md", "empty", "skill.md"]);
    expect(pathProblem("docs/b.md", taken)).toBeNull();
    expect(pathProblem("Docs/A.md", taken)).toBe("taken");
    expect(pathProblem("docs/A.md", taken, "docs/a.md")).toBeNull();
    expect(pathProblem(".git/config", taken)).toBe("invalid");
    expect(pathProblem("what?.md", taken)).toBe("invalid");
    expect(pathProblem("../up.md", taken)).toBe("invalid");
  });
});
