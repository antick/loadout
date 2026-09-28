import type { SkillsFileSource } from "@loadout/shared";
import { invalid } from "../errors";
import type { GitClient } from "../install/git-client";
import { parseGitSource, resolveTreeRef } from "../install/git-source";
import { type FoundSkill, listRepoSkills, resolveSkillDir } from "../install/repo-scan";

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
  let parsed = parseGitSource(typed, { allowLocalPath: options.allowLocalPath });
  if (parsed.treeTail) {
    const tail = parsed.treeTail;
    const split = await resolveTreeRef(parsed.cloneUrl, tail, (url) => git.listRefs(url));
    parsed = { ...parsed, ...split, treeTail: null };
  }
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

function lastSegment(relPath: string): string {
  return relPath.split("/").findLast(Boolean) ?? relPath;
}

/**
 * The skills of a source the file asks for, by name or folder name, and the names it asks for
 * that the source does not have. Null takes them all.
 */
export function chooseSkills(
  available: readonly FoundSkill[],
  wanted: readonly string[] | null,
): { chosen: FoundSkill[]; missing: string[] } {
  if (wanted === null) return { chosen: [...available], missing: [] };
  const chosen: FoundSkill[] = [];
  const missing: string[] = [];
  for (const name of wanted) {
    const key = name.toLowerCase();
    const match = available.find(
      (skill) =>
        skill.relPath === name ||
        skill.name.toLowerCase() === key ||
        lastSegment(skill.relPath).toLowerCase() === key,
    );
    if (!match) missing.push(name);
    else if (!chosen.includes(match)) chosen.push(match);
  }
  return { chosen, missing };
}
