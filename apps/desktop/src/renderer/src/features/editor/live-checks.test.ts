import { describe, expect, it } from "vitest";
import { checkDraft, isSkillDocument } from "./live-checks";

const files = [{ path: "SKILL.md" }, { path: "scripts/run.sh" }, { path: "notes.md" }];

describe("live checks in the editor", () => {
  it("applies only to SKILL.md at the top of the skill", () => {
    expect(isSkillDocument("SKILL.md")).toBe(true);
    expect(isSkillDocument("references/SKILL.md")).toBe(false);
    expect(isSkillDocument("notes.md")).toBe(false);
  });

  it("accepts links to files and folders that exist", () => {
    const text =
      "---\nname: pdf\ndescription: x\n---\n[a](notes.md) [b](scripts) [c](scripts/run.sh)";
    expect(checkDraft(text, "pdf", files)).toEqual([]);
  });

  it("puts errors first and reports missing links", () => {
    const issues = checkDraft("---\nname: pdf\n---\n[gone](missing.md)", "pdf", files);
    expect(issues.map((issue) => issue.code)).toEqual(["description_missing", "broken_reference"]);
  });
});
