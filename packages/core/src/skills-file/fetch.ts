import type { SkillsFileSource } from "@loadout/shared";
import { invalid } from "../errors";
import type { GitClient } from "../install/git-client";
import { resolveGitSource } from "../install/git-source";
import { type FoundSkill, listRepoSkills, resolveSkillDir } from "../install/repo-scan";
import { matchRequested } from "../install/requested";

/** A source checked out at one commit, with the skills it holds. Always call `cleanup`. */
export interface FetchedSource {
  revision: string;
  skills: FoundSkill[];
  cleanup(): Promise<void>;
}

export interface FetchOptions {
  /** The commit to check out; null takes the newest one of the source's branch or tag. */
  revision: string | null;
  /** Tests only: a local folder may stand in for a remote repository. */
  allowLocalPath?: boolean;
}

/**
 * Check a source out and list its skills, every file of each present. A pinned commit the
 * remote no longer serves fails (GIT), never silently falls back to a newer one.
 */
export async function fetchSource(
  git: GitClient,
  source: SkillsFileSource,
  options: FetchOptions,
): Promise<FetchedSource> {
  const typed = source.ref ? `${source.url}#${source.ref}` : source.url;
  const parsed = await resolveGitSource(git, typed, { allowLocalPath: options.allowLocalPath });
  const checkout = await git.checkout(parsed.cloneUrl, {
    branch: parsed.branch,
    revision: options.revision,
  });
  try {
    if (options.revision && checkout.revision !== options.revision) {
      throw invalid(
        `${source.url} could not be checked out at the locked commit ${options.revision}.`,
      );
    }
    const root = resolveSkillDir(checkout.dir, parsed.subpath);
    const skills = listRepoSkills(root);
    await checkout.materialize(skills.map((skill) => skill.dir));
    return { revision: checkout.revision, skills, cleanup: checkout.cleanup };
  } catch (error) {
    await checkout.cleanup();
    throw error;
  }
}

/**
 * The skills of a source the file asks for, by name or folder name, and the names it asks for
 * that the source does not have. Null takes them all; a name several skills answer to is refused.
 */
export function chooseSkills(
  available: readonly FoundSkill[],
  wanted: readonly string[] | null,
): { chosen: FoundSkill[]; missing: string[] } {
  if (wanted === null) return { chosen: [...available], missing: [] };
  const { selected, missing } = matchRequested(available, wanted);
  return { chosen: available.filter((skill) => selected?.includes(skill.relPath)), missing };
}
