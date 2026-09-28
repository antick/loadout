import {
  type Skill,
  groupSkillSources,
  normalizeSourceUrl,
  skillsWithoutSource,
} from "@loadout/shared";
import { describe, expect, it } from "vitest";

function skill(id: string, extra: Partial<Skill>): Skill {
  return {
    id,
    name: id,
    dirName: id,
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
    libraryPath: `/lib/${id}`,
    contentHash: null,
    createdAt: 0,
    updatedAt: 0,
    deployments: [],
    presetIds: [],
    tags: [],
    hasConflict: false,
    editedFiles: [],
    issues: [],
    manualOnly: false,
    ...extra,
  };
}

const REPO = "https://github.com/acme/skills.git";

describe("skill sources", () => {
  it("spells one repository one way", () => {
    expect(normalizeSourceUrl("https://GitHub.com/acme/skills.git/")).toBe(
      "github.com/acme/skills",
    );
    expect(normalizeSourceUrl("git@github.com:acme/skills.git")).toBe("github.com/acme/skills");
    expect(normalizeSourceUrl("https://user:secret@example.com/team/repo")).toBe(
      "example.com/team/repo",
    );
  });

  it("groups by repository, archive and link, and leaves loose skills out", () => {
    const skills = [
      skill("pdf", {
        sourceType: "git",
        sourceUrl: REPO,
        updateStatus: "update_available",
        lastCheckedAt: 5,
      }),
      skill("docx", {
        sourceType: "marketplace",
        sourceRef: "acme/skills/docx",
        sourceUrl: "https://github.com/acme/skills",
        lastCheckedAt: 9,
      }),
      skill("beta", {
        sourceType: "git",
        sourceUrl: REPO,
        sourceBranch: "beta",
        updateStatus: "error",
      }),
      skill("zip-a", { sourceType: "local", sourceRef: "/downloads/pack.zip" }),
      skill("zip-b", { sourceType: "local", sourceRef: "/downloads/pack.zip" }),
      skill("web", { sourceType: "url", sourceRef: "https://files.example.com/x/tools.zip?dl=1" }),
      skill("folder", { sourceType: "local", sourceRef: "/work/folder" }),
      skill("made", {}),
    ];
    const sources = groupSkillSources(skills);
    expect(sources.map((s) => [s.label, s.kind, s.skillIds])).toEqual([
      ["acme/skills", "repository", ["pdf", "docx"]],
      ["acme/skills", "repository", ["beta"]],
      ["files.example.com/tools.zip", "link", ["web"]],
      ["pack.zip", "archive", ["zip-a", "zip-b"]],
    ]);
    const [main, branch, , archive] = sources;
    expect(main).toMatchObject({
      viaMarketplace: true,
      updatesAvailable: 1,
      lastCheckedAt: 9,
      browse: { kind: "git", target: REPO },
    });
    expect(branch).toMatchObject({
      branch: "beta",
      problems: 1,
      browse: { target: `${REPO}#beta` },
    });
    expect(archive?.browse).toEqual({ kind: "archive", target: "/downloads/pack.zip" });
    expect(skillsWithoutSource(skills)).toBe(2);
  });
});
