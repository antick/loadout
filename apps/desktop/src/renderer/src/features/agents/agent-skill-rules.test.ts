import type { LocalSkill, SyncStatus } from "@skillboard/shared";
import { describe, expect, it } from "vitest";
import { agentSkillRules, summarizeAgentFolder } from "./agent-skill-rules";

function folder(syncStatus: SyncStatus, managed: boolean): LocalSkill {
  const matched = syncStatus !== "local_only";
  return {
    name: "skill",
    dirName: "skill",
    relativePath: "skill",
    description: null,
    path: "/home/.agent/skills/skill",
    files: ["SKILL.md"],
    enabled: true,
    agentKey: "agent",
    agentDisplayName: "Agent",
    tags: [],
    librarySkillId: matched ? "lib-skill" : null,
    managed,
    syncStatus,
  };
}

describe("agentSkillRules", () => {
  it("offers nothing for an unmanaged folder that matches the library", () => {
    expect(agentSkillRules(folder("in_sync", false))).toEqual({
      upload: false,
      uploadNeedsConfirm: false,
      pull: false,
      remove: false,
      removeNeedsConfirm: false,
      deleteLocal: false,
    });
  });

  it("lets a local-only folder be uploaded without asking, or deleted", () => {
    const rules = agentSkillRules(folder("local_only", false));
    expect(rules.upload).toBe(true);
    expect(rules.uploadNeedsConfirm).toBe(false);
    expect(rules.deleteLocal).toBe(true);
    expect(rules.pull).toBe(false);
    expect(rules.remove).toBe(false);
  });

  it("asks before an upload that overwrites a library copy", () => {
    for (const status of ["local_newer", "library_newer", "diverged"] as const) {
      const rules = agentSkillRules(folder(status, true));
      expect(rules.upload).toBe(true);
      expect(rules.uploadNeedsConfirm).toBe(true);
    }
  });

  it("offers a pull only when the library has something newer", () => {
    expect(agentSkillRules(folder("library_newer", true)).pull).toBe(true);
    expect(agentSkillRules(folder("diverged", true)).pull).toBe(true);
    expect(agentSkillRules(folder("local_newer", true)).pull).toBe(false);
    expect(agentSkillRules(folder("in_sync", true)).pull).toBe(false);
  });

  it("removes managed skills, asking first when local edits would be lost", () => {
    expect(agentSkillRules(folder("in_sync", true))).toMatchObject({
      remove: true,
      removeNeedsConfirm: false,
      deleteLocal: false,
    });
    expect(agentSkillRules(folder("local_newer", true)).removeNeedsConfirm).toBe(true);
    expect(agentSkillRules(folder("diverged", true)).removeNeedsConfirm).toBe(true);
  });

  it("never deletes a managed folder as if it were local-only", () => {
    expect(agentSkillRules(folder("local_newer", true)).deleteLocal).toBe(false);
  });
});

describe("summarizeAgentFolder", () => {
  it("counts total, managed and in-sync folders", () => {
    expect(
      summarizeAgentFolder([
        folder("in_sync", true),
        folder("in_sync", false),
        folder("local_newer", true),
        folder("local_only", false),
      ]),
    ).toEqual({ total: 4, managed: 2, inSync: 2 });
  });
});
