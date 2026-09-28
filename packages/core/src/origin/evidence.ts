import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SourceEvidence } from "@loadout/shared";
import { redactUrl, validateGitInput } from "../install";
import { readSkillDocument } from "../skills/metadata";
import { canonicalPath, isDirectory, isInside, statOrNull, toPosix } from "../util/fs";

/**
 * Where a skill without a source may have come from, read from this machine only: the Git
 * checkout of the folder it was imported from, and repositories its `SKILL.md` links to. Nothing
 * here touches the network; every lead is compared with its repository before anyone trusts it.
 */

/** A repository worth comparing with a skill. */
export interface SourceLead {
  /** Text `parseGitSource` understands: a clone URL, a tree or `SKILL.md` link, `owner/repo`. */
  input: string;
  evidence: SourceEvidence;
  /** Branch the local checkout is on; null or absent means the text's branch or the default. */
  branch?: string | null;
  /** The skill's exact folder in the repository, `/` separated; null for the top. */
  subpath?: string | null;
  /** Name of the skill to look for when its folder is not known. */
  locator?: string | null;
  /** `owner/repo/skill` for a marketplace listing. */
  marketRef?: string | null;
}

const GIT_DIR = ".git";
const GITDIR_PREFIX = "gitdir:";
const HEAD_REF_PREFIX = "ref: refs/heads/";
const COMMON_DIR_FILE = "commondir";
const ORIGIN = "origin";
const REMOTE_SECTION = /^\[\s*remote\s+"([^"]+)"\s*\]$/i;
const URL_ENTRY = /^url\s*=\s*(.+)$/i;
/** Links in a document are only a hint: a handful is plenty, and a long list is noise. */
const MAX_LINK_LEADS = 5;
/**
 * `https://github.com/owner/repo`, optionally `/tree/…` or `/blob/…`. Stops at characters that
 * end a link in Markdown, HTML or prose.
 */
const GITHUB_LINK =
  /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)((?:\/(?:tree|blob)\/[^\s)"'<>\]`]+)?)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const SKILL_FILE_TAIL = /\/skill\.md$/i;
/** First path segments of github.com that are site pages, not owners. */
const GITHUB_SITE_PAGES: ReadonlySet<string> = new Set([
  "about",
  "apps",
  "collections",
  "explore",
  "features",
  "login",
  "marketplace",
  "orgs",
  "pricing",
  "settings",
  "sponsors",
  "topics",
]);

interface Checkout {
  /** Top of the working tree. */
  root: string;
  /** The folder holding `HEAD` (and, for a plain checkout, `config`). */
  gitDir: string;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** `.git` as a folder, or as a file pointing at one (worktrees and submodules). */
function gitDirOf(folder: string): string | null {
  const dotGit = join(folder, GIT_DIR);
  const stat = statOrNull(dotGit);
  if (!stat) return null;
  if (stat.isDirectory()) return dotGit;
  const pointer = readText(dotGit)?.trim() ?? "";
  if (!pointer.toLowerCase().startsWith(GITDIR_PREFIX)) return null;
  const target = pointer.slice(GITDIR_PREFIX.length).trim();
  const gitDir = isAbsolute(target) ? target : resolve(folder, target);
  return isDirectory(gitDir) ? gitDir : null;
}

/**
 * The Git checkout holding `folder`, looking upwards but never at `homeDir` or above it: a home
 * folder kept in Git (dotfiles) holds copies of skills, not where they came from.
 */
export function findCheckout(folder: string, homeDir: string): Checkout | null {
  const home = canonicalPath(homeDir);
  let current = canonicalPath(folder);
  // `home` inside `current`: we reached the home folder or climbed past it.
  while (!isInside(current, home)) {
    const gitDir = gitDirOf(current);
    if (gitDir) return { root: current, gitDir };
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/** The `url` of the `origin` remote, else of the first remote with one. */
export function remoteUrlOf(configText: string): string | null {
  const urls = new Map<string, string>();
  let remote: string | null = null;
  for (const raw of configText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      remote = REMOTE_SECTION.exec(line)?.[1] ?? null;
      continue;
    }
    const url = remote ? URL_ENTRY.exec(line)?.[1]?.trim() : undefined;
    if (remote && url && !urls.has(remote)) urls.set(remote, url);
  }
  return urls.get(ORIGIN) ?? urls.values().next().value ?? null;
}

/** The shared folder of a worktree, where its `config` lives; the folder itself otherwise. */
function commonDirOf(gitDir: string): string {
  const pointer = readText(join(gitDir, COMMON_DIR_FILE))?.trim();
  if (!pointer) return gitDir;
  return isAbsolute(pointer) ? pointer : resolve(gitDir, pointer);
}

function branchOf(gitDir: string): string | null {
  const head = readText(join(gitDir, "HEAD"))?.trim() ?? "";
  return head.startsWith(HEAD_REF_PREFIX) ? head.slice(HEAD_REF_PREFIX.length) : null;
}

/**
 * A lead from the Git checkout `folder` sits in: its remote, its branch and the folder's place in
 * it. None when there is no checkout, no remote, or the remote is not an address we may use.
 */
export function gitFolderLead(folder: string, homeDir: string): SourceLead | null {
  if (!isDirectory(folder)) return null;
  const checkout = findCheckout(folder, homeDir);
  if (!checkout) return null;
  const config = readText(join(commonDirOf(checkout.gitDir), "config"));
  const url = config ? remoteUrlOf(config) : null;
  if (!url) return null;
  let input: string;
  try {
    // Credentials in a remote stay out of the library; local paths are never a source.
    input = validateGitInput(redactUrl(url));
  } catch {
    return null;
  }
  const subpath = toPosix(relative(checkout.root, canonicalPath(folder))) || null;
  return { input, evidence: "git_folder", branch: branchOf(checkout.gitDir), subpath };
}

function cleanRepoName(repo: string): string {
  return repo.replace(TRAILING_PUNCTUATION, "").replace(/\.git$/i, "");
}

/**
 * Repositories the skill's document links to, in the order they appear. A link to the skill's
 * folder or its `SKILL.md` is kept as it is; any other link inside a repository only names it.
 */
export function linkLeads(skillDir: string, locator: string): SourceLead[] {
  const document = readSkillDocument(skillDir);
  if (!document) return [];
  const leads: SourceLead[] = [];
  const seen = new Set<string>();
  for (const match of document.content.matchAll(GITHUB_LINK)) {
    const owner = match[1] ?? "";
    const repo = cleanRepoName(match[2] ?? "");
    if (!repo || GITHUB_SITE_PAGES.has(owner.toLowerCase())) continue;
    const base = `https://github.com/${owner}/${repo}`;
    const tail = (match[3] ?? "").replace(TRAILING_PUNCTUATION, "");
    const exact = tail.startsWith("/tree/") || SKILL_FILE_TAIL.test(tail);
    const input = exact ? `${base}${tail}` : base;
    const key = input.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push({ input, evidence: "skill_link", locator });
    if (leads.length >= MAX_LINK_LEADS) break;
  }
  return leads;
}
