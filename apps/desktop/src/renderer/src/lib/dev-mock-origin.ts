/**
 * DEV ONLY. Finding and linking the source of skills without one, for the in-memory preview
 * bridge in `dev-mock.ts`. "api-docs" has an exact match and a changed one, "test-first" only a
 * changed copy on the marketplace, "commit-messages" nothing (and an unreachable marketplace).
 */
import {
  type ErrorCode,
  type Skill,
  type SourceCandidate,
  type SourceChoice,
  type SourceSearch,
  canLinkSource,
  repositoryLabel,
} from "@loadout/shared";
import type { MockHandlers } from "@/lib/dev-mock-types";

export interface OriginMockContext {
  getSkills(): Skill[];
  setSkills(next: Skill[]): void;
  emitChanged(...scope: "skills"[]): void;
  fail(code: ErrorCode, message: string): never;
}

const SEARCH_MS = 900;
const REVISION = "5c1e0a9b7d3f";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

function candidate(overrides: Partial<SourceCandidate> & { url: string }): SourceCandidate {
  return {
    label: repositoryLabel(overrides.url),
    branch: null,
    subpath: null,
    marketRef: null,
    evidence: "skill_link",
    revision: REVISION,
    match: "identical",
    similarity: 1,
    changedFiles: [],
    ...overrides,
  };
}

const FOUND: Record<string, SourceCandidate[]> = {
  "api-docs": [
    candidate({
      url: "https://github.com/acme/backend-skills.git",
      subpath: "skills/api-docs",
      evidence: "git_folder",
      branch: "main",
    }),
    candidate({
      url: "https://github.com/someone/api-kit.git",
      subpath: "api-docs",
      evidence: "marketplace",
      marketRef: "someone/api-kit/api-docs",
      match: "similar",
      similarity: 0.94,
      changedFiles: ["SKILL.md", "references/openapi.md"],
    }),
  ],
  "test-first": [
    candidate({
      url: "https://github.com/tdd-club/skills.git",
      subpath: "skills/test-first",
      evidence: "marketplace",
      marketRef: "tdd-club/skills/test-first",
      match: "similar",
      similarity: 0.91,
      changedFiles: ["SKILL.md", "scripts/watch.sh", "examples/a.md", "examples/b.md", "x.md"],
    }),
  ],
};

export function createOriginMockHandlers(ctx: OriginMockContext): MockHandlers {
  function find(skillId: string): Skill {
    const found = ctx.getSkills().find((skill) => skill.id === skillId);
    if (!found) ctx.fail("NOT_FOUND", `There is no skill "${skillId}".`);
    return found;
  }

  function patch(skillId: string, changes: Partial<Skill>): Skill {
    ctx.setSkills(
      ctx.getSkills().map((skill) => (skill.id === skillId ? { ...skill, ...changes } : skill)),
    );
    ctx.emitChanged("skills");
    return find(skillId);
  }

  function requireLinkable(skillId: string): Skill {
    const skill = find(skillId);
    if (!canLinkSource(skill)) ctx.fail("INVALID_INPUT", "This skill already follows a source.");
    return skill;
  }

  return {
    "updates.findSource": async (skillId: string): Promise<SourceSearch> => {
      requireLinkable(skillId);
      await wait(SEARCH_MS);
      return {
        skillId,
        candidates: FOUND[skillId] ?? [],
        failures: skillId === "commit-messages" ? ["Marketplace: fetch failed"] : [],
      };
    },
    "updates.lookUpSource": async (skillId: string, input: string): Promise<SourceCandidate> => {
      const skill = requireLinkable(skillId);
      await wait(SEARCH_MS);
      const [owner, repo] = input.replace(/^https:\/\/github\.com\//, "").split("/");
      if (!owner || !repo) ctx.fail("INVALID_INPUT", "Use owner/repo or a repository link.");
      return candidate({
        url: `https://github.com/${owner}/${repo}.git`,
        subpath: `skills/${skill.name}`,
        evidence: "pasted",
        match: "similar",
        similarity: 0.97,
        changedFiles: ["SKILL.md"],
      });
    },
    "updates.attachSource": async (skillId: string, choice: SourceChoice): Promise<Skill> => {
      requireLinkable(skillId);
      await wait(SEARCH_MS);
      const exact = (FOUND[skillId] ?? []).some(
        (entry) => entry.url === choice.url && entry.match === "identical",
      );
      return patch(skillId, {
        sourceType: choice.marketRef ? "marketplace" : "git",
        sourceRef: choice.marketRef ?? choice.url,
        sourceUrl: choice.url,
        sourceBranch: choice.branch,
        sourceSubpath: choice.subpath,
        sourceRevision: exact ? REVISION : null,
        remoteRevision: REVISION,
        updateStatus: exact ? "up_to_date" : "update_available",
        lastCheckedAt: Date.now(),
        authored: false,
        suggestFor: [],
        blockedAgents: [],
      });
    },
    "skills.setAuthored": async (skillId: string, authored: boolean): Promise<Skill> => {
      if (authored) requireLinkable(skillId);
      return patch(skillId, { authored });
    },
  };
}
