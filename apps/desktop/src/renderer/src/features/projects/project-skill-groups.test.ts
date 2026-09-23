import type { LocalSkill, ProjectTarget, SyncStatus } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import {
  groupProjectSkills,
  hasSkill,
  indexPresence,
  isFolderFree,
  matchesEnabledFilter,
  orderedAvailableTargets,
  projectSkillRules,
  targetOfAgent,
} from "./project-skill-groups";

function copy(
  relativePath: string,
  agentKey: string,
  syncStatus: SyncStatus,
  extra: Partial<LocalSkill> = {},
): LocalSkill {
  return {
    name: relativePath,
    dirName: relativePath,
    relativePath,
    description: null,
    path: `/project/.${agentKey}/skills/${relativePath}`,
    files: ["SKILL.md"],
    enabled: true,
    agentKey,
    agentDisplayName: agentKey,
    tags: [],
    librarySkillId: syncStatus === "local_only" ? null : relativePath.toLowerCase(),
    managed: false,
    linkTarget: null,
    syncStatus,
    ...extra,
  };
}

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

describe("groupProjectSkills", () => {
  it("groups copies by lowercase relative path and keeps the backend's order", () => {
    const groups = groupProjectSkills([
      copy("Review", "claude_code", "in_sync"),
      copy("alpha", "cursor", "in_sync"),
      copy("review", "cursor", "in_sync"),
    ]);
    expect(groups.map((group) => group.id)).toEqual(["review", "alpha"]);
    expect(groups[0]?.variants).toHaveLength(2);
  });

  it("takes the worst status of the variants", () => {
    const status = (...statuses: SyncStatus[]): SyncStatus | undefined =>
      groupProjectSkills(statuses.map((entry, index) => copy("skill", `agent-${index}`, entry)))[0]
        ?.syncStatus;
    expect(status("in_sync", "local_only")).toBe("local_only");
    expect(status("local_only", "library_newer")).toBe("library_newer");
    expect(status("library_newer", "local_newer")).toBe("local_newer");
    expect(status("local_newer", "diverged", "in_sync")).toBe("diverged");
  });

  it("reports all / partial / none enabled", () => {
    const state = (...enabled: boolean[]): string | undefined =>
      groupProjectSkills(
        enabled.map((on, index) => copy("skill", `agent-${index}`, "in_sync", { enabled: on })),
      )[0]?.enabledState;
    expect(state(true, true)).toBe("all");
    expect(state(true, false)).toBe("partial");
    expect(state(false, false)).toBe("none");
  });

  it("keeps a library match even when the worst variant has none", () => {
    const [group] = groupProjectSkills([
      copy("skill", "claude_code", "in_sync", { librarySkillId: "lib-1", tags: ["a"] }),
      copy("skill", "cursor", "diverged", { librarySkillId: null, tags: ["b"] }),
    ]);
    expect(group?.librarySkillId).toBe("lib-1");
    expect(group?.tags).toEqual(["a", "b"]);
  });
});

describe("matchesEnabledFilter", () => {
  it("shows a partly disabled skill under both Enabled and Disabled", () => {
    const [partial] = groupProjectSkills([
      copy("skill", "a", "in_sync"),
      copy("skill", "b", "in_sync", { enabled: false }),
    ]);
    if (!partial) throw new Error("expected a group");
    expect(matchesEnabledFilter(partial, "enabled")).toBe(true);
    expect(matchesEnabledFilter(partial, "disabled")).toBe(true);
    expect(matchesEnabledFilter(partial, "all")).toBe(true);
  });
});

describe("projectSkillRules", () => {
  const rules = (status: SyncStatus) => {
    const [group] = groupProjectSkills([copy("skill", "a", status)]);
    if (!group) throw new Error("expected a group");
    return projectSkillRules(group);
  };

  it("offers the sync actions that fit each status", () => {
    expect(rules("in_sync")).toEqual({ push: false, pull: false, restore: false });
    expect(rules("local_only")).toEqual({ push: true, pull: false, restore: false });
    expect(rules("local_newer")).toEqual({ push: true, pull: false, restore: true });
    expect(rules("library_newer")).toEqual({ push: false, pull: true, restore: false });
    expect(rules("diverged")).toEqual({ push: true, pull: true, restore: false });
  });
});

describe("targets", () => {
  it("orders available targets by export priority, then by detection order", () => {
    const ordered = orderedAvailableTargets([
      target("opencode"),
      target("cursor"),
      target("amp", { installed: false }),
      target("zed"),
      target("claude_code"),
      target("cline", { agentKeys: ["cline", "codex"] }),
    ]);
    expect(ordered.map((entry) => entry.key)).toEqual([
      "claude_code",
      "cline",
      "cursor",
      "opencode",
      "zed",
    ]);
  });

  it("finds a merged target through any of its agent keys", () => {
    const merged = target("cline", { agentKeys: ["cline", "warp"] });
    expect(targetOfAgent([target("cursor"), merged], "warp")).toBe(merged);
    expect(targetOfAgent([merged], "nobody")).toBeUndefined();
  });
});

describe("presence", () => {
  const presence = indexPresence(
    groupProjectSkills([
      copy("Review", "claude_code", "in_sync", { librarySkillId: "lib-review" }),
      copy("notes", "cursor", "local_only"),
    ]),
  );

  it("knows which targets hold a copy linked to a library skill", () => {
    expect(hasSkill(presence, "lib-review", "claude_code")).toBe(true);
    expect(hasSkill(presence, "lib-review", "cursor")).toBe(false);
  });

  it("treats a folder name as taken whatever is in it, ignoring case", () => {
    expect(isFolderFree(presence, "review", "claude_code")).toBe(false);
    expect(isFolderFree(presence, "NOTES", "cursor")).toBe(false);
    expect(isFolderFree(presence, "notes", "claude_code")).toBe(true);
  });
});
