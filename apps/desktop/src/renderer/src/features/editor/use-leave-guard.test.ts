import { describe, expect, it } from "vitest";
import { editorTarget } from "./use-leave-guard";

const at = (pathname: string, search: Record<string, unknown>): string =>
  editorTarget({ pathname, search });

describe("editorTarget", () => {
  it("is the same editor when only the file changes", () => {
    expect(at("/projects/p/edit", { skill: "a", agent: "x", file: "SKILL.md" })).toBe(
      at("/projects/p/edit", { agent: "x", skill: "a", file: "notes.md" }),
    );
  });

  it("is another editor when the skill, agent or project in the search changes", () => {
    expect(at("/instructions/edit", { agent: "claude_code" })).not.toBe(
      at("/instructions/edit", { agent: "claude_code", project: "p" }),
    );
    expect(at("/agents/claude/edit", { skill: "a" })).not.toBe(
      at("/agents/claude/edit", { skill: "b" }),
    );
  });
});
