import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  SKILLS_FILE_NAME,
  type SkillsFileApi,
  type SkillsFileInfo,
  type SkillsFileInit,
  type SkillsFileSource,
  groupSkillSources,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import { normalizeProjectDir } from "../agents/service";
import type { CoreContext } from "../context";
import { exists, invalid, notFound } from "../errors";
import type { GitClient } from "../install/git-client";
import type { SkillStore } from "../skills/store";
import type { SafetyService } from "../safety/service";
import type { RemovedStore } from "../storage/removed";
import { writeFileAtomic } from "../util/fs";
import { indexLibrary, matchLibrarySkill, scanSkillRoot } from "../workspace/local-scan";
import { applyPlan, skillsToWrite } from "./apply";
import { findSkillsFile, loadSkillsFile, stringifySkillsFile } from "./format";
import { preparePlan } from "./plan";
import { realPathOf } from "./safety";

export interface SkillsFileDeps {
  git: GitClient;
  registry: AgentRegistry;
  store: SkillStore;
  removed: RemovedStore;
  /** Checks every skill before it is written, as an install does; absent in tests that skip it. */
  safety?: Pick<SafetyService, "check">;
  /** Tests only: a local folder may stand in for a remote repository. */
  allowLocalGitSources?: boolean;
}

/** The path of the skills file for `dir`, or NOT_FOUND saying where it looked. */
function locate(dir: string): string {
  const path = findSkillsFile(dir);
  if (!path) throw notFound(`No ${SKILLS_FILE_NAME} in ${dir} or any folder above it.`);
  return path;
}

/** Skill folders directly inside a project's agent folder: where applying the file writes them. */
const PROJECT_SCAN = { recursive: false } as const;

/** Apply a project's `skills.toml`: see `shared/types-skills-file.ts`. */
export function createSkillsFileService(
  ctx: CoreContext,
  deps: SkillsFileDeps,
): { api: SkillsFileApi } {
  const planDeps = { git: deps.git, registry: deps.registry, libraryDir: ctx.paths.skillsDir };

  /** The skills file for `dir`; one in the home folder would name the agents' global folders. */
  const load = (dir: string): SkillsFileInfo => {
    const info = loadSkillsFile(locate(dir));
    if (realPathOf(info.root) === realPathOf(ctx.homeDir)) {
      throw invalid(
        `${info.path} is in your home folder, where its folders would be your agents' own. Move it into a project.`,
      );
    }
    return info;
  };

  /**
   * What a skills file for `dir` would say today: every skill in its agents' folders that the
   * library knows from a repository, grouped by that repository. Only proof makes a folder the
   * library's skill: Loadout put it there, or it holds the same files. A library skill that only
   * shares its name may come from another repository, and writing that one would swap the skill.
   */
  function suggest(dir: string): SkillsFileInit {
    const agents = new Set<string>();
    const libraryIds = new Set<string>();
    const library = indexLibrary(deps.store.list(), deps.store.deployments());
    for (const agent of deps.registry.list()) {
      const relative = normalizeProjectDir(agent.projectSkillsDir);
      if (!relative) continue;
      for (const entry of scanSkillRoot(join(dir, relative), PROJECT_SCAN)) {
        const match = matchLibrarySkill(entry, library, "strict");
        if (!match) continue;
        libraryIds.add(match.id);
        agents.add(agent.key);
      }
    }
    const skills = deps.store.list().filter((skill) => libraryIds.has(skill.id));
    const sources: SkillsFileSource[] = groupSkillSources(skills)
      .filter((source) => source.kind === "repository")
      .map((source) => ({
        url: source.location,
        ref: source.branch,
        skills: skills
          .filter((skill) => source.skillIds.includes(skill.id))
          .map((skill) => skill.name),
      }));
    return { agents: [...agents], sources };
  }

  return {
    api: {
      find: async (dir) => {
        const path = findSkillsFile(dir);
        return path ? loadSkillsFile(path) : null;
      },

      suggest: async (dir) => suggest(dir),

      create: async (dir, init) => {
        const path = join(dir, SKILLS_FILE_NAME);
        if (existsSync(path)) throw exists(`${path} already exists.`);
        writeFileAtomic(
          path,
          stringifySkillsFile({ agents: init.agents, gitignore: false, sources: init.sources }),
        );
        return loadSkillsFile(path);
      },

      plan: async (dir, options = {}) => {
        const info = load(dir);
        const prepared = await preparePlan(info, planDeps, {
          update: options.update === true,
          prune: options.prune === true,
          allowLocalGitSources: deps.allowLocalGitSources,
        });
        await prepared.cleanup();
        return prepared.plan;
      },

      apply: async (dir, options = {}) => {
        const info = load(dir);
        // Fetched before the lock: it is never held across the network.
        const prepared = await preparePlan(info, planDeps, {
          update: options.update === true,
          prune: options.prune === true,
          allowLocalGitSources: deps.allowLocalGitSources,
        });
        try {
          // Before the lock too: a scan is slow, and a flagged skill stops the run unwritten.
          const candidates = skillsToWrite(info, prepared).map((skill) => ({
            name: skill.name,
            dir: skill.dir,
          }));
          if (candidates.length > 0) {
            await deps.safety?.check(candidates, { acceptRisk: options.acceptRisk === true });
          }
          const result = await ctx.lock.run(`apply ${SKILLS_FILE_NAME}`, () =>
            applyPlan(info, prepared, { removed: deps.removed }, options.force === true),
          );
          ctx.touched("projects");
          return result;
        } finally {
          await prepared.cleanup();
        }
      },

      unapply: async (dir, options = {}) => {
        const info = load(dir);
        const prepared = await preparePlan(info, planDeps, {
          update: false,
          prune: true,
          nothing: true,
        });
        if (options.dryRun) return { plan: prepared.plan, written: 0, removed: 0, kept: [] };
        const result = await ctx.lock.run(`unapply ${SKILLS_FILE_NAME}`, () =>
          applyPlan(info, prepared, { removed: deps.removed }, options.force === true),
        );
        ctx.touched("projects");
        return result;
      },
    },
  };
}
