import { skillAuthoringPrompt } from "@loadout/shared";
import { describe, expect, it } from "vitest";

/** The prompt an agent gets to write a new skill in full. */

const base = {
  name: "ship-it",
  description: "Ship a release.",
  folder: "/p/.claude/skills/ship-it",
};

describe("skillAuthoringPrompt", () => {
  it("names one folder and has no copy step for a single folder", () => {
    const prompt = skillAuthoringPrompt(base);
    expect(prompt).toContain("\n/p/.claude/skills/ship-it\n");
    expect(prompt).toContain("Write only inside the folder above.");
    expect(prompt).not.toContain("## Copies");
    expect(prompt).not.toMatch(/\n\n\n/);
  });

  it("has the agent copy the finished folder into every other agent folder", () => {
    const prompt = skillAuthoringPrompt({
      ...base,
      copies: ["/p/.cursor/skills/ship-it", "/p/.codex/skills/ship-it"],
    });
    expect(prompt).toContain("## Copies");
    expect(prompt).toContain("2 other folders");
    expect(prompt).toContain("- /p/.cursor/skills/ship-it\n- /p/.codex/skills/ship-it\n");
    expect(prompt).toContain("Write only inside the folders above.");
    expect(prompt).not.toMatch(/\n\n\n/);
  });
});
