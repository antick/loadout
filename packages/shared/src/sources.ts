import type { Skill } from "./types";

/**
 * The places skills came from, grouped from the skills themselves: a Git repository (installed
 * directly or through the marketplace), an archive on this computer, or a download link. Skills
 * made in the app or imported from single folders have no shared source and are left out.
 */

export type SkillSourceKind = "repository" | "archive" | "link";

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
   * an archive path for `install.previewArchive`.
   */
  browse: { kind: "git" | "archive"; target: string };
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
  failed: { name: string; message: string }[];
}

const ARCHIVE_SUFFIXES = [".zip", ".skill", ".tar.gz", ".tgz", ".tar"] as const;
const GIT_SUFFIX = /\.git$/i;
const CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi;
/** `git@host:owner/repo`. */
const SCP_STYLE = /^[^@\s]+@([^:\s]+):(.+)$/;
const GITHUB_HOST = "github.com";
const PROBLEM_STATUSES: ReadonlySet<Skill["updateStatus"]> = new Set(["error", "source_missing"]);

/** `scheme://[user@]host[:port]/path`: the host and path of an address. */
const ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([^/:?#\s]+)(?::\d+)?([^?#\s]*)/i;

const redact = (url: string): string => url.replace(CREDENTIALS, "$1");

/** Host (lower case) and path of an address; null when the text is not one. */
function hostAndPath(url: string): { host: string; path: string } | null {
  const match = ADDRESS.exec(url);
  if (!match?.[1]) return null;
  return { host: match[1].toLowerCase(), path: match[2] ?? "" };
}

/** A clone URL in one spelling: no trailing slash or `.git`, host in lower case. */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "").replace(GIT_SUFFIX, "");
  const scp = SCP_STYLE.exec(trimmed);
  if (scp?.[1] && scp[2]) return `${scp[1].toLowerCase()}/${scp[2]}`;
  const parsed = hostAndPath(trimmed);
  return parsed ? `${parsed.host}${parsed.path.replace(/\/+$/, "")}` : trimmed;
}

/** `owner/repo` for GitHub, `host/owner/repo` elsewhere. */
function repositoryLabel(url: string): string {
  const normalized = normalizeSourceUrl(url);
  const [host, ...rest] = normalized.split("/");
  const path = rest.join("/");
  if (!path) return normalized;
  return host === GITHUB_HOST ? path : `${host}/${path}`;
}

function lastSegment(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path;
}

const isArchivePath = (ref: string): boolean =>
  ARCHIVE_SUFFIXES.some((suffix) => ref.toLowerCase().endsWith(suffix));

/** `SkillSource.key` of a repository at a branch: one spelling of the URL, `#branch` when set. */
export function repositorySourceKey(url: string, branch: string | null): string {
  return `${normalizeSourceUrl(url)}${branch ? `#${branch}` : ""}`;
}

/** Where one skill came from, as a source; null when it has none worth grouping. */
function sourceOf(
  skill: Skill,
): Omit<SkillSource, "skillIds" | "updatesAvailable" | "problems" | "lastCheckedAt"> | null {
  if ((skill.sourceType === "git" || skill.sourceType === "marketplace") && skill.sourceUrl) {
    const branch = skill.sourceType === "git" ? skill.sourceBranch : null;
    const url = skill.sourceUrl;
    return {
      key: repositorySourceKey(url, branch),
      kind: "repository",
      label: repositoryLabel(url),
      location: redact(url),
      branch,
      viaMarketplace: skill.sourceType === "marketplace",
      browse: { kind: "git", target: branch ? `${url}#${branch}` : url },
    };
  }
  const ref = skill.sourceRef;
  if (!ref) return null;
  if (skill.sourceType === "url") {
    const parsed = hostAndPath(ref);
    const label = parsed ? `${parsed.host}/${lastSegment(parsed.path)}` : ref;
    return {
      key: ref,
      kind: "link",
      label,
      location: redact(ref),
      branch: null,
      viaMarketplace: false,
      browse: { kind: "git", target: ref },
    };
  }
  if (skill.sourceType === "local" && isArchivePath(ref)) {
    return {
      key: ref,
      kind: "archive",
      label: lastSegment(ref),
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
    const found = sourceOf(skill);
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
  return [...sources.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

/** How many skills belong to no source (made here, or imported from a single folder). */
export function skillsWithoutSource(skills: readonly Skill[]): number {
  return skills.filter((skill) => sourceOf(skill) === null).length;
}
