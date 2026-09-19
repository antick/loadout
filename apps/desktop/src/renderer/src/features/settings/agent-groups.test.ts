import type { AgentInfo } from "@skillboard/shared";
import { describe, expect, it } from "vitest";
import { groupAgents, mergeGroupOrder } from "./agent-groups";

function agent(key: string, patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    key,
    displayName: key,
    category: "coding",
    installed: true,
    enabled: true,
    isCustom: false,
    skillsDir: `/home/${key}`,
    hasPathOverride: false,
    projectSkillsDir: null,
    hasProjectPathOverride: false,
    sharesDirWith: [],
    ...patch,
  };
}

describe("groupAgents", () => {
  it("splits detected, custom and not-installed agents, keeping their order", () => {
    const groups = groupAgents([
      agent("a"),
      agent("b", { installed: false }),
      agent("c", { isCustom: true }),
      agent("d"),
    ]);
    expect(groups.detected.map((entry) => entry.key)).toEqual(["a", "d"]);
    expect(groups.custom.map((entry) => entry.key)).toEqual(["c"]);
    expect(groups.other.map((entry) => entry.key)).toEqual(["b"]);
  });
});

describe("mergeGroupOrder", () => {
  it("reorders one group inside the slots it already had", () => {
    expect(mergeGroupOrder(["a", "x", "b", "y", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "x",
      "a",
      "y",
      "b",
    ]);
  });

  it("leaves the list alone when the group is empty", () => {
    expect(mergeGroupOrder(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
