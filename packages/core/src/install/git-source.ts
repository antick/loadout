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
const GIT_SUFFIX = ".git";
const URL_PREFIXES = ["https://", "http://", "ssh://"] as const;
const LOCAL_URL_PREFIX = "file://";
/** `git@host:owner/repo.git` */
const SCP_STYLE = /^git@[\w.-]+:[^\s]+$/i;
/** `owner/repo`, the GitHub shorthand. Never starts with `.`, `-`, `/` or `~`, so it is never a path. */
const SHORTHAND = /^[A-Za-z0-9_][\w.-]*\/[A-Za-z0-9_][\w.-]*$/;
const GITHUB_TREE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/tree\/(.+)$/i;
const SCHEME_NOT_ALLOWED =
  "URL scheme not allowed. Use https://, http://, ssh://, git@host:owner/repo.git or owner/repo.";

function hasUrlPrefix(text: string): boolean {
  const lower = text.toLowerCase();
  return URL_PREFIXES.some((prefix) => lower.startsWith(prefix));
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

/** Trim and check the typed text. Returns the trimmed text, throws INVALID_INPUT otherwise. */
export function validateGitInput(input: string, options: GitInputOptions = {}): string {
  const text = input.trim();
  if (!text) throw invalid("Repository URL is required");
  // A leading dash would be read by git as an option; whitespace never belongs in a URL.
  if (text.startsWith("-") || /\s/.test(text)) throw invalid(SCHEME_NOT_ALLOWED);
  if (hasUrlPrefix(text) || SCP_STYLE.test(text) || SHORTHAND.test(text)) return text;
  if (options.allowLocalPath && isLocalSource(text)) return text;
  throw invalid(SCHEME_NOT_ALLOWED);
}

/** Understand every accepted source form. Validates first, so callers need not. */
export function parseGitSource(input: string, options: GitInputOptions = {}): GitSource {
  const text = validateGitInput(input, options);
  const plain = { branch: null, subpath: null, treeTail: null };

  const tree = GITHUB_TREE.exec(text);
  if (tree) {
    const [, owner = "", repo = "", rawTail = ""] = tree;
    const segments = rawTail.split("/").filter(Boolean).map(decodeSegment);
    const [first, ...rest] = segments;
    const cloneUrl = githubCloneUrl(owner, repo);
    if (first === undefined) return { cloneUrl, ...plain };
    return {
      cloneUrl,
      branch: first,
      subpath: rest.length > 0 ? rest.join("/") : null,
      treeTail: rest.length > 0 ? segments.join("/") : null,
    };
  }

  if (SHORTHAND.test(text)) {
    const [owner = "", repo = ""] = text.split("/");
    return { cloneUrl: githubCloneUrl(owner, repo), ...plain };
  }
  return { cloneUrl: text, ...plain };
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
