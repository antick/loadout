import { lastPathSegment, skillMatchesName } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { matchRequested } from "../src/install/requested";

const skills = [
  { relPath: "skills/code-review", name: "Code Review" },
  { relPath: "tools/lint", name: "linter" },
];

describe("skill names asked for", () => {
  it("matches the path, the name or the folder, ignoring case", () => {
    const [review, lint] = skills;
    expect(skillMatchesName(review!, "skills/code-review")).toBe(true);
    expect(skillMatchesName(review!, "code review")).toBe(true);
    expect(skillMatchesName(review!, "CODE-REVIEW")).toBe(true);
    expect(skillMatchesName(lint!, "LINTER")).toBe(true);
    expect(skillMatchesName(lint!, "lin")).toBe(false);
  });

  it("ticks what matched and names what did not", () => {
    expect(matchRequested(skills, [" lint ", "lint", "nope"])).toEqual({
      selected: ["tools/lint"],
      missing: ["nope"],
    });
    expect(matchRequested(skills, [])).toEqual({ selected: null, missing: [] });
  });

  it("takes the last part of a path with either slash", () => {
    expect(lastPathSegment("a/b/")).toBe("b");
    expect(lastPathSegment("a\\b")).toBe("b");
    expect(lastPathSegment("")).toBe("");
  });
});
