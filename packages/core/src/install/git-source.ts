import { isAbsolute } from "node:path";
import { invalid, isAppError } from "../errors";

/** Where a Git install comes from, after the typed text has been understood. */
export interface GitSource {
  cloneUrl: string;
  branch: string | null;
  subpath: string | null;
  /**
   * Everything after `/tree/` when it has more than one segment. Branch names may contain `/`, so
   * `branch` and `subpath` are only a first guess until {@link resolveTreeRef} has seen the remote.
   */
  treeTail: string | null;
  /** A skill named in the text (`owner/repo@skill`, `#main@skill`): the one to preselect. */
  skill: string | null;
}

export interface GitInputOptions {
  /**
   * Accept an absolute folder path or a `file://` URL as the repository. Internal only: tests use
   * it to clone local fixtures. Never set it for text a user typed.
   */
  allowLocalPath?: boolean;
}

export interface RemoteRefs {
  branches: string[];
  tags: string[];
}

export type ListRefs = (cloneUrl: string) => Promise<RemoteRefs>;

const GITHUB_URL = "https://github.com";
const GITLAB_URL = "https://gitlab.com";
const GIT_SUFFIX = ".git";
const URL_PREFIXES = ["https://", "http://", "ssh://"] as const;
const LOCAL_URL_PREFIX = "file://";
const GITHUB_PREFIX = "github:";
const GITLAB_PREFIX = "gitlab:";
/** `git@host:owner/repo.git` */
const SCP_STYLE = /^git@[\w.-]+:[^\s]+$/i;
const REPO_SEGMENT = String.raw`[A-Za-z0-9_][\w.-]*`;
/** `owner/repo`, the GitHub shorthand. Never starts with `.`, `-`, `/` or `~`, so it is never a path. */
const SHORTHAND = new RegExp(`^${REPO_SEGMENT}\\/${REPO_SEGMENT}$`);
/** `owner/repo/path/in/repo`, optionally `@skill`. */
const SHORTHAND_WITH_PATH = new RegExp(
  `^${REPO_SEGMENT}\\/${REPO_SEGMENT}(?:\\/[^\\s@]+)?(?:@[^\\s/@]+)?$`,
);
/** `group/sub/repo` after `gitlab:`: GitLab nests groups. */
const GITLAB_PATH = new RegExp(`^${REPO_SEGMENT}(?:\\/${REPO_SEGMENT})+$`);
const GITHUB_TREE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/tree\/(.+)$/i;
/** A link to a repository's `SKILL.md` on GitHub: the skill is the folder around it. */
const GITHUB_SKILL_FILE =
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/blob\/(.+)\/skill\.md$/i;
/** `https://host/group/repo/-/tree/branch/path`, the GitLab spelling, self-hosted too. */
const GITLAB_TREE = /^(https:\/\/[^/\s]+)\/(.+?)(?:\.git)?\/-\/tree\/(.+)$/i;
/** A GitLab page showing a skill's `SKILL.md`: the skill is the folder around it. */
const GITLAB_SKILL_FILE = /^(https:\/\/[^/\s]+)\/(.+?)(?:\.git)?\/-\/blob\/(.+)\/skill\.md$/i;
/** A skill page on the marketplace: `https://skills.sh/owner/repo/skill`. */
const MARKET_PAGE = /^https:\/\/(?:www\.)?skills\.sh\/([\w.-]+)\/([\w.-]+)\/([\w.:-]+)\/?$/i;
/** First path segments of the marketplace that are site pages, not owners. */
const MARKET_SITE_PAGES: ReadonlySet<string> = new Set([
  "api",
  "audits",
  "docs",
  "official",
  "p",
  "packs",
  "site",
  "topic",
]);
const SCHEME_NOT_ALLOWED =
  "URL scheme not allowed. Use https://, http://, ssh://, git@host:owner/repo.git or owner/repo.";
const CLIMBS_OUT = "A path inside the repository cannot contain '..'";

function hasUrlPrefix(text: string): boolean {
  const lower = text.toLowerCase();
  return URL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function hasHostPrefix(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.startsWith(GITHUB_PREFIX) || lower.startsWith(GITLAB_PREFIX);
}

function isLocalSource(text: string): boolean {
  return text.toLowerCase().startsWith(LOCAL_URL_PREFIX) || isAbsolute(text);
}

function stripGitSuffix(text: string): string {
  return text.toLowerCase().endsWith(GIT_SUFFIX) ? text.slice(0, -GIT_SUFFIX.length) : text;
}

function githubCloneUrl(owner: string, repo: string): string {
  return `${GITHUB_URL}/${owner}/${stripGitSuffix(repo)}${GIT_SUFFIX}`;
}

/** Text that can only mean a repository, so a `#fragment` on it names a branch or tag. */
function isGitLike(text: string): boolean {
  return (
    hasUrlPrefix(text) ||
    hasHostPrefix(text) ||
    SCP_STYLE.test(text) ||
    SHORTHAND_WITH_PATH.test(text)
  );
}

/** Trim and check the typed text. Returns the trimmed text, throws INVALID_INPUT otherwise. */
export function validateGitInput(input: string, options: GitInputOptions = {}): string {
  const text = input.trim();
  if (!text) throw invalid("Repository URL is required");
  // A leading dash would be read by git as an option; whitespace never belongs in a URL.
  if (text.startsWith("-") || /\s/.test(text)) throw invalid(SCHEME_NOT_ALLOWED);
  const bare = splitFragment(text).text;
  if (isGitLike(bare)) {
    // `github:` and `gitlab:` say little on their own; what follows must be a repository.
    if (hasHostPrefix(bare)) parseWithoutFragment(bare);
    return text;
  }
  if (options.allowLocalPath && isLocalSource(text)) return text;
  throw invalid(SCHEME_NOT_ALLOWED);
}

/** `text#ref@skill` → its parts. Only a repository's text has a fragment; anything else is kept. */
function splitFragment(text: string): { text: string; ref: string | null; skill: string | null } {
  const hash = text.indexOf("#");
  if (hash === -1) return { text, ref: null, skill: null };
  const before = text.slice(0, hash);
  if (!isGitLike(before)) return { text, ref: null, skill: null };
  const fragment = text.slice(hash + 1);
  const at = fragment.indexOf("@");
  const ref = (at === -1 ? fragment : fragment.slice(0, at)) || null;
  const skill = (at === -1 ? "" : fragment.slice(at + 1)) || null;
  return { text: before, ref, skill };
}

/** `a/b/c` with no empty, `.` or `..` segment; throws on a path that would climb out. */
function cleanPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean).map(decodeSegment);
  if (segments.some((segment) => segment === ".." || segment === ".")) throw invalid(CLIMBS_OUT);
  return segments.length > 0 ? segments.join("/") : null;
}

/** `owner/repo[/path][@skill]`, the text after `github:` or on its own. */
function parseShorthand(text: string): GitSource {
  const at = text.lastIndexOf("@");
  const skill = at > text.lastIndexOf("/") ? text.slice(at + 1) || null : null;
  const repoPath = skill === null ? text : text.slice(0, at);
  const [owner = "", repo = "", ...rest] = repoPath.split("/");
  return {
    cloneUrl: githubCloneUrl(owner, repo),
    branch: null,
    subpath: cleanPath(rest.join("/")),
    treeTail: null,
    skill,
  };
}

/** A `/tree/` tail split on its first segment; see {@link GitSource.treeTail}. */
function fromTreeTail(cloneUrl: string, rawTail: string): GitSource {
  const segments = (cleanPath(rawTail) ?? "").split("/").filter(Boolean);
  const [first, ...rest] = segments;
  if (first === undefined)
    return { cloneUrl, branch: null, subpath: null, treeTail: null, skill: null };
  return {
    cloneUrl,
    branch: first,
    subpath: rest.length > 0 ? rest.join("/") : null,
    treeTail: rest.length > 0 ? segments.join("/") : null,
    skill: null,
  };
}

function parseWithoutFragment(text: string): GitSource {
  const lower = text.toLowerCase();
  if (lower.startsWith(GITHUB_PREFIX)) {
    const rest = text.slice(GITHUB_PREFIX.length);
    if (!SHORTHAND_WITH_PATH.test(rest)) throw invalid(SCHEME_NOT_ALLOWED);
    return parseShorthand(rest);
  }
  if (lower.startsWith(GITLAB_PREFIX)) {
    const rest = stripGitSuffix(text.slice(GITLAB_PREFIX.length));
    if (!GITLAB_PATH.test(rest)) throw invalid(SCHEME_NOT_ALLOWED);
    return {
      cloneUrl: `${GITLAB_URL}/${rest}${GIT_SUFFIX}`,
      branch: null,
      subpath: null,
      treeTail: null,
      skill: null,
    };
  }

  const tree = GITHUB_TREE.exec(text);
  if (tree) {
    const [, owner = "", repo = "", rawTail = ""] = tree;
    return fromTreeTail(githubCloneUrl(owner, repo), rawTail);
  }
  const skillFile = GITHUB_SKILL_FILE.exec(text);
  if (skillFile) {
    const [, owner = "", repo = "", rawTail = ""] = skillFile;
    return fromTreeTail(githubCloneUrl(owner, repo), rawTail);
  }
  const gitlabTree = GITLAB_TREE.exec(text) ?? GITLAB_SKILL_FILE.exec(text);
  if (gitlabTree) {
    const [, origin = "", path = "", rawTail = ""] = gitlabTree;
    return fromTreeTail(`${origin}/${path}${GIT_SUFFIX}`, rawTail);
  }
  const marketPage = MARKET_PAGE.exec(text);
  if (marketPage && !MARKET_SITE_PAGES.has((marketPage[1] ?? "").toLowerCase())) {
    const [, owner = "", repo = "", skill = ""] = marketPage;
    return {
      cloneUrl: githubCloneUrl(owner, repo),
      branch: null,
      subpath: null,
      treeTail: null,
      skill,
    };
  }

  if (SHORTHAND_WITH_PATH.test(text)) return parseShorthand(text);
  return { cloneUrl: text, branch: null, subpath: null, treeTail: null, skill: null };
}

/**
 * True when no repository pattern claims `text`: it is an address as typed, with no branch, path,
 * skill name or host shorthand read out of it. Only such an address may be a site with an index.
 */
export function isPlainUrl(text: string): boolean {
  try {
    const source = parseGitSource(text);
    return (
      source.cloneUrl === text.trim() &&
      source.branch === null &&
      source.subpath === null &&
      source.skill === null
    );
  } catch {
    return false;
  }
}

/** Understand every accepted source form. Validates first, so callers need not. */
export function parseGitSource(input: string, options: GitInputOptions = {}): GitSource {
  const text = validateGitInput(input, options);
  if (options.allowLocalPath && isLocalSource(text)) {
    return { cloneUrl: text, branch: null, subpath: null, treeTail: null, skill: null };
  }
  const fragment = splitFragment(text);
  const source = parseWithoutFragment(fragment.text);
  return {
    ...source,
    // A branch in a tree URL wins over one in a fragment: the tree URL is the more specific.
    branch: source.branch ?? fragment.ref,
    skill: fragment.skill ?? source.skill,
  };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function longestPrefix(tail: string, names: string[]): string | null {
  const matches = names.filter((name) => tail === name || tail.startsWith(`${name}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Split a tree tail into branch and subpath using the refs the remote really has: the longest
 * branch that is a `/`-bounded prefix, else the longest tag, else the first segment.
 */
export async function resolveTreeRef(
  cloneUrl: string,
  tail: string,
  listRefs: ListRefs,
): Promise<{ branch: string; subpath: string | null }> {
  const clean = tail.split("/").filter(Boolean).join("/");
  let refs: RemoteRefs = { branches: [], tags: [] };
  try {
    refs = await listRefs(cloneUrl);
  } catch (error) {
    if (isAppError(error, "CANCELLED")) throw error;
    // An unreachable remote fails properly at clone time; here we only lose the smarter split.
  }
  const ref =
    longestPrefix(clean, refs.branches) ??
    longestPrefix(clean, refs.tags) ??
    (clean.split("/")[0] as string);
  const rest = clean.slice(ref.length + 1);
  return { branch: ref, subpath: rest || null };
}

/** `owner/repo` from the marketplace → clone URL. */
export function marketSourceToUrl(source: string): string {
  const text = source.trim();
  if (!SHORTHAND.test(text)) throw invalid(`Invalid marketplace source: '${source}'`);
  const [owner = "", repo = ""] = text.split("/");
  return githubCloneUrl(owner, repo);
}

/** Identity of a repository for the clone cache: trimmed, without a trailing `/` or `.git`. */
export function normalizeRepoUrl(url: string): string {
  return stripGitSuffix(url.trim().replace(/\/+$/, ""));
}

/** Last path segment of a clone URL without `.git`; names the working copy folder. */
export function repoNameFromUrl(url: string): string {
  const normalized = normalizeRepoUrl(url);
  return normalized.slice(Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf(":")) + 1);
}

/** Hide `user:token@` so credentials never reach a message or the log. */
export function redactUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, "$1");
}
