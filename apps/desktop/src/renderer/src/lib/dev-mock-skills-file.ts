/** DEV ONLY. `skillsFile.*` for the browser preview: one file per project folder, in memory. */
import {
  SKILLS_FILE_NAME,
  SKILLS_LOCK_NAME,
  type SkillsFileApplyOptions,
  type SkillsFileEntry,
  type SkillsFileInfo,
  type SkillsFileInit,
  type SkillsFilePlan,
  type SkillsFileResult,
} from "@loadout/shared";

type Handler = (...args: never[]) => unknown;

const FETCH_MS = 700;
const MOCK_REVISION = "4f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39";
/** Project folder of each agent the mock knows. */
const AGENT_DIRS: Record<string, string> = {
  claude_code: ".claude/skills",
  cursor: ".cursor/skills",
  codex: ".agents/skills",
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createSkillsFileMockHandlers(): Record<string, Handler> {
  const files = new Map<string, SkillsFileInfo>();

  function planFor(info: SkillsFileInfo, nothing: boolean): SkillsFilePlan {
    const applied = new Set(info.lock?.folders.map((entry) => entry.folder) ?? []);
    const entries: SkillsFileEntry[] = nothing
      ? [...applied].map((folder) => ({
          folder,
          skill: folder.split("/").at(-1) ?? folder,
          url: info.spec.sources[0]?.url ?? "",
          agents: [],
          action: "remove",
        }))
      : info.spec.sources.flatMap((source) =>
          (source.skills ?? ["code-review"]).flatMap((skill) =>
            info.spec.agents.map((agent) => {
              const folder = `${AGENT_DIRS[agent] ?? `.${agent}/skills`}/${skill}`;
              return {
                folder,
                skill,
                url: source.url,
                agents: [agent],
                action: applied.has(folder) ? "same" : "add",
              } satisfies SkillsFileEntry;
            }),
          ),
        );
    return {
      root: info.root,
      sources: nothing
        ? []
        : info.spec.sources.map((source) => ({
            url: source.url,
            ref: source.ref,
            revision: MOCK_REVISION,
            moved: !info.lock,
            missing: [],
          })),
      entries,
      unknownAgents: [],
    };
  }

  function run(dir: string, nothing: boolean): SkillsFileResult {
    const info = files.get(dir);
    if (!info) throw new Error(`No ${SKILLS_FILE_NAME} in ${dir}`);
    const plan = planFor(info, nothing);
    const written = plan.entries.filter((entry) => entry.action === "add").length;
    const removed = plan.entries.filter((entry) => entry.action === "remove").length;
    files.set(dir, {
      ...info,
      lock: {
        version: 1,
        sources: plan.sources.map(({ url, ref, revision }) => ({ url, ref, revision })),
        folders: nothing
          ? []
          : plan.entries.map((entry) => ({
              folder: entry.folder,
              url: entry.url,
              skillPath: entry.skill,
              hash: "mock",
            })),
      },
    });
    return { plan, written, removed, kept: [] };
  }

  return {
    "skillsFile.find": (dir: string) => files.get(dir) ?? null,
    "skillsFile.suggest": async (): Promise<SkillsFileInit> => {
      await wait(FETCH_MS);
      return {
        agents: ["claude_code", "cursor"],
        sources: [{ url: "https://github.com/acme/skills", ref: null, skills: ["code-review"] }],
      };
    },
    "skillsFile.create": (dir: string, init: SkillsFileInit): SkillsFileInfo => {
      const info: SkillsFileInfo = {
        root: dir,
        path: `${dir}/${SKILLS_FILE_NAME}`,
        spec: { agents: init.agents, gitignore: false, sources: init.sources },
        lockPath: `${dir}/${SKILLS_LOCK_NAME}`,
        lock: null,
      };
      files.set(dir, info);
      return info;
    },
    "skillsFile.plan": async (dir: string) => {
      await wait(FETCH_MS);
      const info = files.get(dir);
      if (!info) throw new Error(`No ${SKILLS_FILE_NAME} in ${dir}`);
      return planFor(info, false);
    },
    "skillsFile.apply": async (dir: string, _options?: SkillsFileApplyOptions) => {
      await wait(FETCH_MS);
      return run(dir, false);
    },
    "skillsFile.unapply": async (dir: string, options?: { dryRun?: boolean }) => {
      await wait(FETCH_MS);
      const info = files.get(dir);
      if (options?.dryRun && info) {
        return { plan: planFor(info, true), written: 0, removed: 0, kept: [] };
      }
      return run(dir, true);
    },
  };
}
