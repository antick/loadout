import type { BrokenSkillFolder } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { brokenFolderProblem } from "./broken-folders";

const folder = (overrides: Partial<BrokenSkillFolder>): BrokenSkillFolder => ({
  dirName: "leftover",
  relativePath: "leftover",
  path: "/home/me/.claude/skills/leftover",
  reason: "missing_document",
  linkTarget: null,
  files: [],
  managed: false,
  ...overrides,
});

describe("brokenFolderProblem", () => {
  it("names the missing target of a dangling link", () => {
    expect(
      brokenFolderProblem(folder({ reason: "dangling_link", linkTarget: "/gone/skill" })),
    ).toEqual({ key: "agents.broken.reason.danglingLink", target: "/gone/skill" });
  });

  it("tells an empty folder from one with files but no SKILL.md", () => {
    expect(brokenFolderProblem(folder({}))).toEqual({ key: "agents.broken.reason.empty" });
    expect(brokenFolderProblem(folder({ files: ["notes.md", "scripts/"] }))).toEqual({
      key: "agents.broken.reason.noDocument",
      count: 2,
    });
  });
});
