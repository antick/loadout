import type { EditTarget } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { absoluteFilePath } from "./editor-paths";

const target = (overrides: Partial<EditTarget>): EditTarget => ({
  location: { kind: "library", skillId: "pdf" },
  name: "pdf",
  folderName: "pdf",
  path: "/Users/me/.loadout/skills/pdf",
  placeLabel: "Library",
  librarySkillId: "pdf",
  otherCopies: [],
  ...overrides,
});

describe("absoluteFilePath", () => {
  it("puts a skill's file under its folder", () => {
    expect(absoluteFilePath(target({}), "references/forms.md")).toBe(
      "/Users/me/.loadout/skills/pdf/references/forms.md",
    );
  });

  it("uses an instruction file's own path", () => {
    const file = target({
      location: { kind: "instructions", agentKey: "claude-code", projectId: null },
      path: "/Users/me/.claude/CLAUDE.md",
    });
    expect(absoluteFilePath(file, "CLAUDE.md")).toBe("/Users/me/.claude/CLAUDE.md");
  });
});
