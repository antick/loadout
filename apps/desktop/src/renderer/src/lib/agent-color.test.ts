import { AGENT_PRIORITY_ORDER } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { AGENT_TINT_COUNT, agentMonogram, agentTintIndex } from "./agent-color";

describe("agentTintIndex", () => {
  it("gives the first agents in the default order different tints", () => {
    const first = AGENT_PRIORITY_ORDER.slice(0, AGENT_TINT_COUNT).map(agentTintIndex);
    expect(new Set(first).size).toBe(AGENT_TINT_COUNT);
  });

  it("keeps any key, custom ones included, inside the tint range and stable", () => {
    for (const key of ["my_agent", "custom-thing", "x"]) {
      const tint = agentTintIndex(key);
      expect(tint).toBeGreaterThanOrEqual(1);
      expect(tint).toBeLessThanOrEqual(AGENT_TINT_COUNT);
      expect(agentTintIndex(key)).toBe(tint);
    }
  });
});

describe("agentMonogram", () => {
  it("uses the initials of two words, else the first two letters", () => {
    expect(agentMonogram("Claude Code")).toBe("CC");
    expect(agentMonogram("Cursor")).toBe("CU");
  });
});
