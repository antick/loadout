/**
 * DEV ONLY. `publish.*` for the browser preview. It knows a made-up repository: one skill it
 * already holds unchanged, one it holds an older copy of. A repository address that contains
 * "secret" shows the key warning; one that contains "bad" fails, so the error shows too.
 */
import {
  DEFAULT_PUBLISH_LAYER,
  PUBLISH_LAYER_DIRS,
  type PublishInput,
  type PublishPlan,
  type PublishResult,
  type PublishSkillPlan,
  type PublishTarget,
  type Skill,
} from "@loadout/shared";

type Handler = (...args: never[]) => unknown;

const MOCK_BRANCH = "main";
const MOCK_COMMIT = "9f3c2a71b0d4e8a65c1f7d2b3e4a5968c7d0e1f2";

export function createPublishMockHandlers(getSkills: () => Skill[]): Record<string, Handler> {
  let saved: PublishTarget | null = null;

  function planFor(input: PublishInput): PublishPlan {
    if (/bad/i.test(input.repo)) {
      throw Object.assign(
        new Error(
          "Could not reach the repository. Check your internet connection and proxy setting.",
        ),
        {
          code: "NETWORK",
        },
      );
    }
    const layer = input.layer ?? DEFAULT_PUBLISH_LAYER;
    const dir = PUBLISH_LAYER_DIRS[layer];
    const skills = getSkills().filter((skill) => input.skillIds.includes(skill.id));
    const plans: PublishSkillPlan[] = skills.map((skill, index) => ({
      skillId: skill.id,
      name: skill.name,
      folder: `${dir}/${skill.name}`,
      status: index === 0 ? "unchanged" : index === 1 ? "changed" : "new",
      reason: null,
      files:
        index === 1 ? { added: 1, changed: 2, removed: 0 } : { added: 0, changed: 0, removed: 0 },
      leftOut: index === 2 ? ["node_modules/", ".env"] : [],
      leftOutCount: index === 2 ? 2 : 0,
    }));
    return {
      target: { repo: input.repo, branch: input.branch ?? MOCK_BRANCH, layer },
      repoEmpty: false,
      newBranch:
        input.branch !== null && input.branch !== undefined && input.branch !== MOCK_BRANCH,
      skills: plans,
      secrets: /secret/i.test(input.repo)
        ? [
            {
              id: "mock-secret",
              file: `${dir}/${skills[0]?.name ?? "skill"}/notes.md`,
              path: "/mock/notes.md",
              line: 12,
              kind: "github_token",
              masked: "ghp_…Zx9Q",
              committed: false,
            },
          ]
        : [],
    };
  }

  return {
    "publish.defaults": () => saved,
    "publish.preview": async (input: PublishInput) => planFor(input),
    "publish.publish": async (input: PublishInput): Promise<PublishResult> => {
      const plan = planFor(input);
      if (plan.secrets.length > 0 && input.allowSecrets !== true) {
        throw Object.assign(new Error("Publishing held back: a file looks like a key or token."), {
          code: "SECRETS_FOUND",
        });
      }
      const published = plan.skills.filter((s) => s.status === "new" || s.status === "changed");
      saved = { repo: input.repo, branch: input.branch ?? null, layer: plan.target.layer };
      const label = input.repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
      return {
        plan,
        commit: published.length > 0 ? MOCK_COMMIT : null,
        published: published.map((s) => s.name),
        unchanged: plan.skills.filter((s) => s.status === "unchanged").map((s) => s.name),
        installCommands: plan.skills
          .filter((s) => s.status !== "skipped")
          .map((s) => `npx skills add ${label} --skill ${s.name}`),
      };
    },
  };
}
