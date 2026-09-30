import { describe, expect, it } from "vitest";
import { newSkillFolders } from "./new-skill-folders";

const project = { path: "/code/shop-web" };
const targets = [{ relativeDir: ".claude/skills" }, { relativeDir: ".cursor/skills" }];

describe("newSkillFolders", () => {
  it("puts a library skill in the library's skills folder", () => {
    expect(
      newSkillFolders({ name: "notes", project: null, targets, libraryPath: "/home/me/.loadout" }),
    ).toEqual({ main: "/home/me/.loadout/skills/notes", copies: [] });
  });

  it("writes a project skill in the first agent folder and copies it into the rest", () => {
    expect(newSkillFolders({ name: "notes", project, targets, libraryPath: null })).toEqual({
      main: "/code/shop-web/.claude/skills/notes",
      copies: ["/code/shop-web/.cursor/skills/notes"],
    });
  });

  it("knows nothing until the name is usable or a folder is picked", () => {
    expect(newSkillFolders({ name: null, project, targets, libraryPath: "/l" })).toEqual({
      main: null,
      copies: [],
    });
    expect(newSkillFolders({ name: "notes", project, targets: [], libraryPath: "/l" }).main).toBe(
      null,
    );
    expect(newSkillFolders({ name: "notes", project: null, targets, libraryPath: null }).main).toBe(
      null,
    );
  });

  it("keeps Windows separators for a Windows project", () => {
    const windows = newSkillFolders({
      name: "notes",
      project: { path: "C:\\code\\shop" },
      targets,
      libraryPath: null,
    });
    expect(windows).toEqual({
      main: "C:\\code\\shop\\.claude\\skills\\notes",
      copies: ["C:\\code\\shop\\.cursor\\skills\\notes"],
    });
  });
});
