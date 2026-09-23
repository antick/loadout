import type { RemoteRefs } from "./git-source";

/**
 * How a remote's refs are read and which one a branch name means. Shared by the git client and
 * the Git-less HTTP client, so both pick the same commit for the same name.
 */

export const DEFAULT_REF = "HEAD";
export const HEADS_PREFIX = "refs/heads/";
export const TAGS_PREFIX = "refs/tags/";
const PEELED_SUFFIX = "^{}";

/** Ref name → commit, as `git ls-remote` prints them (`<sha> <ref>` per line). */
export function parseRefLines(stdout: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha && ref) refs.set(ref, sha);
  }
  return refs;
}

/** Refs to ask for, best first: a branch beats a tag, and a peeled tag beats the tag object. */
export function refCandidates(branch?: string | null): string[] {
  const name = branch?.trim();
  return name
    ? [`${HEADS_PREFIX}${name}`, `${TAGS_PREFIX}${name}${PEELED_SUFFIX}`, `${TAGS_PREFIX}${name}`]
    : [DEFAULT_REF];
}

/** The commit of the first candidate the remote has; null when it has none of them. */
export function pickRevision(
  refs: ReadonlyMap<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const sha = refs.get(candidate);
    if (sha) return sha;
  }
  return null;
}

/** Branch and tag names, without the peeled duplicates of annotated tags. */
export function refLists(refs: ReadonlyMap<string, string>): RemoteRefs {
  const names = [...refs.keys()].filter((ref) => !ref.endsWith(PEELED_SUFFIX));
  const under = (prefix: string): string[] =>
    names.filter((ref) => ref.startsWith(prefix)).map((ref) => ref.slice(prefix.length));
  return { branches: under(HEADS_PREFIX), tags: under(TAGS_PREFIX) };
}
