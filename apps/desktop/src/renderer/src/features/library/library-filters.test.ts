import type { Skill } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  type LibraryFilters,
  filterSkills,
  isOnEveryAgent,
} from "@/features/library/library-filters";

function skill(name: string, deployedTo: string[], blockedAgents: string[] = []): Skill {
  return {
    id: name,
    name,
    dirName: name,
    description: null,
    sourceType: "local",
    sourceRef: null,
    sourceUrl: null,
    sourceSubpath: null,
    sourceBranch: null,
    sourceRevision: null,
    remoteRevision: null,
    updateStatus: "up_to_date",
    lastCheckedAt: null,
    lastCheckError: null,
    libraryPath: `/lib/${name}`,
    contentHash: null,
    createdAt: 0,
    updatedAt: 0,
    deployments: deployedTo.map((agentKey) => ({
      id: `${name}:${agentKey}`,
      skillId: name,
      agentKey,
      targetPath: `/agents/${agentKey}/${name}`,
      mode: "symlink",
      syncedAt: null,
    })),
    presetIds: [],
    tags: [],
    hasConflict: false,
    editedFiles: [],
    issues: [],
    manualOnly: false,
    traits: [],
    authored: false,
    suggestFor: [],
    blockedAgents,
  };
}

const AVAILABLE = new Set(["claude_code", "codex", "cursor"]);
const ALL_KEYS = [...AVAILABLE];

const SKILLS = [
  skill("everywhere", ALL_KEYS),
  skill("some", ["codex"]),
  skill("nowhere", []),
  skill("all-but-blocked", ["claude_code", "cursor"], ["codex"]),
  skill("only-blocked", [], ALL_KEYS),
  skill("elsewhere", ["opencode"]),
];

const filtered = (status: LibraryFilters["status"]): string[] =>
  filterSkills(SKILLS, { ...EMPTY_FILTERS, status, sort: "name" }, undefined, AVAILABLE).map(
    (entry) => entry.name,
  );

describe("library filters by how many agents have a skill", () => {
  it("counts an agent the skill is blocked for as no gap", () => {
    expect(filtered("deployed_all")).toEqual(["all-but-blocked", "everywhere"]);
  });

  it("puts every deployed skill that still has a gap under some agents", () => {
    expect(filtered("deployed_some")).toEqual(["elsewhere", "some"]);
  });

  it("keeps not deployed and deployed as they were", () => {
    expect(filtered("not_deployed")).toEqual(["nowhere", "only-blocked"]);
    expect(filtered("deployed")).toEqual(["all-but-blocked", "elsewhere", "everywhere", "some"]);
  });

  it("never calls a skill with nowhere to go, or with no agents around, complete", () => {
    expect(isOnEveryAgent(skill("x", [], ALL_KEYS), AVAILABLE)).toBe(false);
    expect(isOnEveryAgent(skill("x", ALL_KEYS), new Set())).toBe(false);
  });
});
