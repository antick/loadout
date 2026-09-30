import type { Skill } from "./types";

/**
 * Finding where a skill without a source came from, so it can follow that source from then on.
 * The evidence is looked at first on this machine (the `npx skills` lock file, the Git settings of
 * the folder it was imported from, links in its `SKILL.md`), then on the marketplace, and each
 * candidate is compared with the library copy before the user links it.
 */

/**
 * What pointed at a candidate. `skills_lock`: the `npx skills` lock file on this machine records
 * it as where the skill was installed from. `git_folder`: the folder the skill was imported from
 * is inside a Git checkout of it. `skill_link`: its `SKILL.md` links to it. `marketplace`: a skill
 * of the same name is listed there. `pasted`: the user typed it.
 */
export type SourceEvidence = "skills_lock" | "git_folder" | "skill_link" | "marketplace" | "pasted";

/**
 * How the library copy compares with the candidate's latest version. `identical`: same files.
 * `similar`: its `SKILL.md` is at least {@link SOURCE_SIMILAR_RATIO} alike. `different`: less.
 */
export type SourceMatchKind = "identical" | "similar" | "different";

/** `SKILL.md` texts this alike (0 to 1) count as the same skill with changes. */
export const SOURCE_SIMILAR_RATIO = 0.9;

/** A repository that may be where a skill came from, compared with the library copy. */
export interface SourceCandidate {
  /** Clone URL, credentials removed. */
  url: string;
  /** `owner/repo` for GitHub, `host/path` elsewhere. */
  label: string;
  /** Null: the repository's default branch. */
  branch: string | null;
  /** The skill's folder in the repository, `/` separated; null for the top. */
  subpath: string | null;
  /** `owner/repo/skill` when the marketplace lists it; the skill then follows it from there. */
  marketRef: string | null;
  evidence: SourceEvidence;
  /** The commit compared with. */
  revision: string;
  match: SourceMatchKind;
  /** How alike the two `SKILL.md` texts are, 0 to 1. */
  similarity: number;
  /** Files that differ (added, removed or changed), `/` separated, sorted. */
  changedFiles: string[];
}

/** What a search for one skill's source found. */
export interface SourceSearch {
  skillId: string;
  /** Best first: identical, then most alike. */
  candidates: SourceCandidate[];
  /** Leads that could not be looked at, one line each (unreachable repository, and so on). */
  failures: string[];
}

/** The candidate the user chose. Everything else is looked up again when it is linked. */
export type SourceChoice = Pick<
  SourceCandidate,
  "url" | "branch" | "subpath" | "marketRef" | "evidence"
>;

const ARCHIVE_SUFFIXES = [".zip", ".skill", ".tar.gz", ".tgz", ".tar"] as const;

/**
 * True for a skill that follows nothing a check can reach upstream: made here, detached, or
 * imported from a folder. Such a skill can be linked to a repository. Archives and links already
 * have a source.
 */
export function canLinkSource(skill: Pick<Skill, "sourceType" | "sourceRef">): boolean {
  if (skill.sourceType === "import") return true;
  if (skill.sourceType !== "local") return false;
  const ref = skill.sourceRef?.toLowerCase() ?? "";
  return !ARCHIVE_SUFFIXES.some((suffix) => ref.endsWith(suffix));
}

/** Skills worth searching a source for: linkable and not marked as the user's own. */
export function needsSourceSearch(
  skill: Pick<Skill, "sourceType" | "sourceRef" | "authored">,
): boolean {
  return canLinkSource(skill) && !skill.authored;
}
