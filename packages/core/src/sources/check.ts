import {
  type NewSourceSkill,
  type Skill,
  type SourceCheckResult,
  type SourceNews,
  repositorySourceKey,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage } from "../errors";
import type { GitClient, InstallIntoLibrary } from "../install";
import { subpathOf } from "../install/fetched-preview";
import { skillHoldingName } from "../install/replace";
import { listRepoSkills } from "../install/repo-scan";
import { type SafetyGate, batchFailureMessage, installChecked } from "../install/safety-gate";
import type { SkillStore } from "../skills/store";
import {
  type RemoteTarget,
  isRemoteSource,
  remoteTargetOf,
  resolveRemoteRevision,
} from "../updates/source";
import type { RepositoryState, SourceNewsStore } from "./news-store";

export interface SourceCheckerDeps {
  store: SkillStore;
  git: GitClient;
  install: InstallIntoLibrary;
  news: SourceNewsStore;
  safety?: SafetyGate;
}

export interface SourceChecker {
  news(): SourceNews[];
  check(sourceKeys?: readonly string[]): Promise<SourceCheckResult>;
}

/** One repository the library has skills from. */
interface Repository {
  key: string;
  label: string;
  skills: Skill[];
}

/** A skill found in a checkout, with where it sits. */
interface FoundInRepository extends NewSourceSkill {
  dir: string;
}

/** The repository a skill came from, keyed as the Sources page keys it; null for other sources. */
function repositoryKeyOf(skill: Skill): string | null {
  if (!isRemoteSource(skill) || !skill.sourceUrl) return null;
  return repositorySourceKey(
    skill.sourceUrl,
    skill.sourceType === "git" ? skill.sourceBranch : null,
  );
}

function repositories(skills: readonly Skill[]): Repository[] {
  const byKey = new Map<string, Repository>();
  for (const skill of skills) {
    const key = repositoryKeyOf(skill);
    if (!key) continue;
    const repository = byKey.get(key) ?? { key, label: key, skills: [] };
    repository.skills.push(skill);
    byKey.set(key, repository);
  }
  return [...byKey.values()];
}

/** Paths of the repository the library already holds, from any of its skills. */
function installedPaths(repository: Repository): Set<string> {
  return new Set(repository.skills.map((skill) => skill.sourceSubpath ?? ""));
}

/**
 * New skills in the repositories the library has skills from. A repository is fetched only when
 * its commit moved since the last look. The first look takes everything there as known, so only
 * what arrives afterwards is news; skills skipped in an import or dismissed stay quiet.
 */
export function createSourceChecker(ctx: CoreContext, deps: SourceCheckerDeps): SourceChecker {
  const { store, git, news } = deps;

  async function autoAdd(
    target: RemoteTarget,
    revision: string,
    found: FoundInRepository[],
    materialize: (dirs: readonly string[]) => Promise<void>,
    result: SourceCheckResult,
  ): Promise<string[]> {
    // A name already in the library needs a person: replace it, rename, or leave it.
    const free = found.filter((skill) => !skillHoldingName(store, skill.name));
    if (free.length === 0) return [];
    await materialize(free.map((skill) => skill.dir));
    const added: string[] = [];
    for (const skill of free) {
      try {
        const installed = await installChecked(deps.install, deps.safety, {
          sourceDir: skill.dir,
          name: skill.name,
          record: {
            sourceType: "git",
            sourceRef: target.branch ? `${target.url}#${target.branch}` : target.url,
            sourceUrl: target.url,
            sourceSubpath: skill.path || null,
            sourceBranch: target.branch,
            sourceRevision: revision,
            updateStatus: "up_to_date",
          },
        });
        added.push(skill.path);
        result.added.push(installed.name);
      } catch (error) {
        result.failed.push({
          name: skill.name,
          message: batchFailureMessage(error, errorMessage(error)),
        });
      }
    }
    return added;
  }

  async function look(repository: Repository, result: SourceCheckResult): Promise<void> {
    const [first] = repository.skills;
    if (!first) return;
    const target = remoteTargetOf(first);
    const revision = await resolveRemoteRevision(git, target);
    const before = news.get(repository.key);
    if (before && before.revision === revision) {
      news.set(repository.key, { ...before, checkedAt: Date.now() });
      return;
    }
    const checkout = await git.checkout(target.url, {
      branch: target.branch,
      revision,
      manifestsOnly: true,
    });
    try {
      const found: FoundInRepository[] = listRepoSkills(checkout.dir, {
        libraryDir: ctx.paths.skillsDir,
      }).map((skill) => ({
        path: subpathOf(checkout.dir, skill.dir) ?? "",
        name: skill.name,
        description: skill.description,
        dir: skill.dir,
      }));
      const seen = new Set(before ? before.seen : found.map((skill) => skill.path));
      const have = installedPaths(repository);
      let fresh = found.filter((skill) => !seen.has(skill.path) && !have.has(skill.path));
      if (fresh.length > 0 && ctx.settings.get("autoAddNewSkills")) {
        const added = new Set(
          await autoAdd(target, checkout.revision, fresh, checkout.materialize, result),
        );
        for (const path of added) seen.add(path);
        fresh = fresh.filter((skill) => !added.has(skill.path));
      }
      const state: RepositoryState = {
        revision,
        seen: [...seen],
        found: fresh.map(({ path, name, description }) => ({ path, name, description })),
        checkedAt: Date.now(),
      };
      news.set(repository.key, state);
    } finally {
      await checkout.cleanup();
    }
  }

  function currentNews(): SourceNews[] {
    const states = news.all();
    return repositories(store.list()).flatMap((repository) => {
      const state = states[repository.key];
      if (!state) return [];
      // Installed since the look, in any way: no longer news.
      const have = installedPaths(repository);
      const skills = state.found.filter((skill) => !have.has(skill.path));
      return skills.length > 0
        ? [{ sourceKey: repository.key, skills, checkedAt: state.checkedAt }]
        : [];
    });
  }

  return {
    news: currentNews,

    check: async (sourceKeys) => {
      const wanted = sourceKeys ? new Set(sourceKeys) : null;
      const result: SourceCheckResult = { news: [], added: [], failed: [] };
      for (const repository of repositories(store.list())) {
        if (wanted && !wanted.has(repository.key)) continue;
        try {
          await look(repository, result);
        } catch (error) {
          result.failed.push({ name: repository.label, message: errorMessage(error) });
        }
      }
      result.news = currentNews();
      return result;
    },
  };
}
