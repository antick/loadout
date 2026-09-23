import { describe, expect, it } from "vitest";
import { compactHome, joinPath } from "./paths";

describe("joinPath", () => {
  it("joins a relative path under a POSIX folder", () => {
    expect(joinPath("/Users/me/.loadout/skills/pdf", "scripts/run.py")).toBe(
      "/Users/me/.loadout/skills/pdf/scripts/run.py",
    );
  });

  it("keeps Windows separators for a Windows folder", () => {
    expect(joinPath("C:\\Users\\me\\skills\\pdf", "scripts/run.py")).toBe(
      "C:\\Users\\me\\skills\\pdf\\scripts\\run.py",
    );
  });

  it("drops a trailing separator and empty segments", () => {
    expect(joinPath("/skills/pdf/", "/SKILL.md")).toBe("/skills/pdf/SKILL.md");
  });

  it("returns the folder for an empty relative path", () => {
    expect(joinPath("/skills/pdf", "")).toBe("/skills/pdf");
  });
});

describe("compactHome", () => {
  it("shortens the home folder to ~", () => {
    expect(compactHome("/Users/me/.claude/skills", "/Users/me")).toBe("~/.claude/skills");
  });

  it("leaves a sibling folder with the same prefix alone", () => {
    expect(compactHome("/Users/meg/x", "/Users/me")).toBe("/Users/meg/x");
  });
});
