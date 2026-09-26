import type { LocalSkill, Project, ProjectTarget } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { projectTargetChips } from "../../components/AgentTargetChips";
import { defaultChipKeys, placeTargets, takenInFolders } from "./new-skill-place";

function target(key: string, extra: Partial<ProjectTarget> = {}): ProjectTarget {
  return {
    key,
    displayName: key,
    agentKeys: [key],
    relativeDir: `.${key}/skills`,
    enabled: true,
    installed: true,
    isCustom: false,
    ...extra,
  };
}

function project(type: Project["type"]): Project {
  return { id: "p", name: "repo", path: "/work/repo", type } as Project;
}

function copy(relativePath: string, agentKey: string): LocalSkill {
  return { relativePath, agentKey } as LocalSkill;
}

describe("placeTargets", () => {
  const targets = [
    target("cursor"),
    target("claude_code"),
    target("goose", { installed: false }),
    target("amp", { enabled: false }),
  ];

  it("offers a project's usable agents, the usual ones first", () => {
    expect(placeTargets(project("project"), targets).map((entry) => entry.key)).toEqual([
      "claude_code",
      "cursor",
    ]);
  });

  it("keeps every folder of a linked workspace", () => {
    expect(placeTargets(project("linked"), targets)).toHaveLength(4);
  });
});

describe("defaultChipKeys", () => {
  const targets = [
    target("claude_code"),
    target("cursor"),
    target("warp", { agentKeys: ["warp", "amp"] }),
  ];
  const chips = projectTargetChips(targets);

  it("ticks the agents remembered for the project, through a shared folder too", () => {
    expect([...defaultChipKeys(chips, targets, ["cursor", "amp"])]).toEqual(["cursor", "warp"]);
  });

  it("ticks only the first folder when nothing is remembered or it is all gone", () => {
    expect([...defaultChipKeys(chips, targets, [])]).toEqual(["claude_code"]);
    expect([...defaultChipKeys(chips, targets, ["gemini_cli"])]).toEqual(["claude_code"]);
    expect([...defaultChipKeys([], [], [])]).toEqual([]);
  });
});

describe("takenInFolders", () => {
  it("names the top folders of the chosen agents only, lower-cased", () => {
    const skills = [
      copy("Review", "claude_code"),
      copy("team/notes", "claude_code"),
      copy("other", "cursor"),
    ];
    expect([...takenInFolders(skills, new Set(["claude_code"]))]).toEqual(["review", "team"]);
  });
});
