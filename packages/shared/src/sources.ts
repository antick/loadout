import type { BatchFailure, Skill, SourceType } from "./types";
import { redactUrl } from "./secrets";
import { isArchivePath } from "./constants";
import { lastPathSegment } from "./skill-match";
import { compareNames } from "./compare";

/**
 * The places skills came from, grouped from the skills themselves: a Git repository (installed
 * directly or through the marketplace), an archive on this computer, or a download link. Skills
 * made in the app or imported from single folders have no shared source and are left out.
 */

export type SkillSourceKind = "repository" | "archive" | "link" | "registry";

/** Sources on the network: checked and updated by fetching, not by reading a local path. */
const REMOTE_SOURCE_TYPES: ReadonlySet<SourceType> = new Set(["git", "marketplace", "clawhub"]);

/** The skill came from a Git repository or a marketplace. */
export function isRemoteSource(skill: Pick<Skill, "sourceType">): boolean {
  return REMOTE_SOURCE_TYPES.has(skill.sourceType);
}

/**
 * The skill has an upstream it can be updated from: a Git repository, a marketplace, or the
 * folder, archive or link it was imported from. Edits to such a skill can be replaced by an update.
 */
export function hasTrackedSource(skill: Pick<Skill, "sourceType" | "sourceRef">): boolean {
  return isRemoteSource(skill) || Boolean(skill.sourceRef);
}

/** `PendingRemoval.location` of a file in the library copy (the rest name an agent). */
export const REMOVAL_IN_LIBRARY = "library";

export interface SkillSource {
  /** Stable identity: the repository (and branch), the archive path or the link. */
  key: string;
  kind: SkillSourceKind;
  /** Short name to show: `owner/repo`, the archive's file name, the link's host and file. */
  label: string;
  /** Where it is, safe to show (credentials removed). */
  location: string;
  branch: string | null;
  /** Some of its skills came through the marketplace. */
  viaMarketplace: boolean;
  skillIds: string[];
  updatesAvailable: number;
  /** Skills whose last check failed or whose source is gone. */
  problems: number;
  /** Newest check of any of its skills; null when none was checked. */
  lastCheckedAt: number | null;
  /**
   * What to preview to see everything the source offers now: text for `install.previewGit`, or
   * an archive path for `install.previewArchive`. Null for a registry entry, which is one skill.
   */
  browse: { kind: "git" | "archive"; target: string } | null;
}

/** A skill a repository holds now that was not there when it was last looked at. */
export interface NewSourceSkill {
  /** Folder in the repository, `/` separated; empty for a skill at the top. */
  path: string;
  name: string;
  description: string | null;
}

/** What a repository gained since the skills in it were last seen or skipped. */
export interface SourceNews {
  /** `SkillSource.key` of the repository. */
  sourceKey: string;
  skills: NewSourceSkill[];
  /** When the repository was last looked at (epoch ms). */
  checkedAt: number;
}

/** What `updates.checkSources` found, and what it added when adding new skills is switched on. */
export interface SourceCheckResult {
  news: SourceNews[];
  /** Names of skills added to the library by themselves (the auto-add setting). */
  added: string[];
  failed: BatchFailure[];
}

const GIT_SUFFIX = /\.git$/i;
/** `git@host:owner/repo`. */
const SCP_STYLE = /^[^@\s]+@([^:\s]+):(.+)$/;
const GITHUB_HOST = "github.com";
const PROBLEM_STATUSES: ReadonlySet<Skill["updateStatus"]> = new Set(["error", "source_missing"]);

/** `scheme://[user@]host[:port]/path`: the host and path of an address. */
const ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([^/:?#\s]+)(?::\d+)?([^?#\s]*)/i;

/** Host (lower case) and path of an address; null when the text is not one. */
function hostAndPath(url: string): { host: string; path: string } | null {
  const match = ADDRESS.exec(url);
  if (!match?.[1]) return null;
  return { host: match[1].toLowerCase(), path: match[2] ?? "" };
}

/**
 * A clone URL in one spelling, and the one test of "same repository" everywhere (Sources page,
 * install preview, update checks, clone cache, publish target): `host/path` with the scheme,
 * user, password and port left out, `git@host:path` read as `host/path`, the host in lower case,
 * no trailing slash or `.git`. The path keeps its case: some hosts and local folders tell
 * `Repo` from `repo`. A local path stays as written, minus a trailing slash or `.git`.
 */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "").replace(GIT_SUFFIX, "");
  // A scheme first: `ssh://git@host:22/path` also looks like `user@host:path`.
  const parsed = hostAndPath(trimmed);
  if (parsed) return `${parsed.host}${parsed.path.replace(/\/+$/, "")}`;
  const scp = SCP_STYLE.exec(trimmed);
  return scp?.[1] && scp[2] ? `${scp[1].toLowerCase()}/${scp[2]}` : trimmed;
}

/** `owner/repo` for GitHub, `host/owner/repo` elsewhere. */
export function repositoryLabel(url: string): string {
  const normalized = normalizeSourceUrl(url);
  const [host, ...rest] = normalized.split("/");
  const path = rest.join("/");
  if (!path) return normalized;
  return host === GITHUB_HOST ? path : `${host}/${path}`;
}

/** `SkillSource.key` of a repository at a branch: one spelling of the URL, `#branch` when set. */
export function repositorySourceKey(url: string, branch: string | null): string {
  return `${normalizeSourceUrl(url)}${branch ? `#${branch}` : ""}`;
}

/** A source without the per-skill tallies: what one skill alone can say about where it is from. */
export type SkillSourceIdentity = Omit<
  SkillSource,
  "skillIds" | "updatesAvailable" | "problems" | "lastCheckedAt"
>;

/** Where one skill came from, as a source; null when it has none worth grouping. */
export function skillSourceOf(skill: Skill): SkillSourceIdentity | null {
  if ((skill.sourceType === "git" || skill.sourceType === "marketplace") && skill.sourceUrl) {
    const branch = skill.sourceType === "git" ? skill.sourceBranch : null;
    const url = skill.sourceUrl;
    return {
      key: repositorySourceKey(url, branch),
      kind: "repository",
      label: repositoryLabel(url),
      location: redactUrl(url),
      branch,
      viaMarketplace: skill.sourceType === "marketplace",
      browse: { kind: "git", target: branch ? `${url}#${branch}` : url },
    };
  }
  const ref = skill.sourceRef;
  if (!ref) return null;
  if (skill.sourceType === "clawhub") {
    return {
      key: `clawhub:${ref}`,
      kind: "registry",
      label: ref,
      location: skill.sourceUrl ?? ref,
      branch: null,
      viaMarketplace: false,
      browse: null,
    };
  }
  if (skill.sourceType === "url") {
    const parsed = hostAndPath(ref);
    const label = parsed ? `${parsed.host}/${lastPathSegment(parsed.path)}` : ref;
    return {
      key: ref,
      kind: "link",
      label,
      location: redactUrl(ref),
      branch: null,
      viaMarketplace: false,
      browse: { kind: "git", target: ref },
    };
  }
  if (skill.sourceType === "local" && isArchivePath(ref)) {
    return {
      key: ref,
      kind: "archive",
      label: lastPathSegment(ref),
      location: ref,
      branch: null,
      viaMarketplace: false,
      browse: { kind: "archive", target: ref },
    };
  }
  return null;
}

/** Every source with its skills, sorted by label. Skills without a shared source are left out. */
export function groupSkillSources(skills: readonly Skill[]): SkillSource[] {
  const sources = new Map<string, SkillSource>();
  for (const skill of skills) {
    const found = skillSourceOf(skill);
    if (!found) continue;
    const source = sources.get(found.key) ?? {
      ...found,
      skillIds: [],
      updatesAvailable: 0,
      problems: 0,
      lastCheckedAt: null,
    };
    source.skillIds.push(skill.id);
    source.viaMarketplace ||= found.viaMarketplace;
    if (skill.updateStatus === "update_available") source.updatesAvailable += 1;
    if (PROBLEM_STATUSES.has(skill.updateStatus)) source.problems += 1;
    if (skill.lastCheckedAt !== null) {
      source.lastCheckedAt = Math.max(source.lastCheckedAt ?? 0, skill.lastCheckedAt);
    }
    sources.set(found.key, source);
  }
  return [...sources.values()].sort((a, b) => compareNames(a.label, b.label));
}

/** How many skills belong to no source (made here, or imported from a single folder). */
export function skillsWithoutSource(skills: readonly Skill[]): number {
  return skills.filter((skill) => skillSourceOf(skill) === null).length;
}
