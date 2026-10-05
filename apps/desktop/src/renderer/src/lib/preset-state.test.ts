import type { Preset } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { computePresetState } from "@/lib/preset-state";

const PRESET: Preset = {
  id: "p",
  name: "Web",
  description: null,
  icon: null,
  sortOrder: 0,
  switchedOff: {},
  skillIds: ["a", "b"],
  createdAt: 0,
  updatedAt: 0,
};
const KNOWN = new Set(["a", "b"]);
const AGENTS = ["claude", "codex"];
const allButB = (skillId: string, agentKey: string): boolean =>
  !(skillId === "b" && agentKey === "codex");

describe("preset pill state", () => {
  it("counts every skill × agent pair when nothing is left out", () => {
    const state = computePresetState(PRESET, KNOWN, AGENTS, () => false, "agent-pair");
    expect(state).toMatchObject({ activity: "inactive", installed: 0, total: 4 });
  });

  it("leaves out pairs switched off or blocked, so the pill can show it is complete", () => {
    // b is switched off (or blocked) for codex; everything else is deployed.
    const state = computePresetState(PRESET, KNOWN, AGENTS, allButB, "agent-pair", allButB);
    expect(state).toMatchObject({ activity: "active", installed: 3, total: 3 });
    expect(state.missing).toEqual([]);
  });

  it("is empty when the preset would deploy nothing to these agents", () => {
    const state = computePresetState(
      PRESET,
      KNOWN,
      AGENTS,
      () => true,
      "agent-pair",
      () => false,
    );
    expect(state.activity).toBe("empty");
  });
});
