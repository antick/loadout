import { basename, join, relative } from "node:path";
import { invalid, notFound } from "../errors";
import { readFrontmatter, readSkillIdentity } from "../skills/metadata";
import {
  canonicalPath,
  isDirectory,
  isInside,
  isSkillDir,
  lstatOrNull,
  readDirSafe,
  toPosix,
} from "../util/fs";

/** A skill folder found under a scan root. */
export interface FoundSkill {
  dir: string;
  /** Path relative to the scan root, `/` separated; the folder's own name when it is the root. */
  relPath: string;
  name: string;
  description: string | null;
}

export interface FindOptions {
  /** How many levels below the root to look. Unlimited when omitted. */
  maxDepth?: number;
  /** Links that resolve inside this folder are ours already and are skipped. */
  libraryDir?: string;
}

/** Folders that never hold installable skills. */
const SKIPPED_DIR_NAMES: ReadonlySet<string> = new Set([
  ".hub",
  ".git",
  "node_modules",
  "__MACOSX",
]);
/** Where a named skill usually lives, tried before searching the whole repository. */
const LOCATOR_DIRS = ["", "skills", ".agents/skills"] as const;
const LOCATOR_SEARCH_DEPTH = 6;
/** Conventional containers, tried when a repository has no skill at its root. */
const CONTAINER_DIRS = ["skills", "skill"] as const;
/** Hidden folders every agent reads, so a skill inside one is not tied to a single agent. */
const SHARED_HIDDEN_DIRS: ReadonlySet<string> = new Set([".agents"]);

/** Lexically inside, and — once it exists, so links can be followed — really inside too. */
function assertInside(repoDir: string, path: string, label: string): void {
  const reallyInside =
    lstatOrNull(path) === null || isInside(canonicalPath(repoDir), canonicalPath(path));
  if (!isInside(repoDir, path) || !reallyInside) {
    throw invalid(`Path '${label}' resolves outside the repository`);
  }
}

/**
 * Every skill folder under `root`, sorted by path. A skill folder is a leaf: nothing inside it is
 * looked at, so bundled examples never show up as separate skills.
 */
export function findSkillDirs(root: string, options: FindOptions = {}): string[] {
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const library = options.libraryDir ? canonicalPath(options.libraryDir) : null;
  const visited = new Set<string>();
  const found: string[] = [];

  const walk = (dir: string, depth: number): void => {
    const real = canonicalPath(dir);
    // The visited set is what stops a link pointing back up the tree from looping forever.
    if (visited.has(real)) return;
    visited.add(real);
    if (isSkillDir(dir)) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    for (const entry of readDirSafe(dir)) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (!isDirectory(child)) continue;
      if (
        library &&
        lstatOrNull(child)?.isSymbolicLink() &&
        isInside(library, canonicalPath(child))
      )
        continue;
      walk(child, depth + 1);
    }
  };

  walk(root, 0);
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** True when a path runs through one agent's own folder, such as `.claude/skills/pdf`. */
export function isAgentSpecificPath(relPath: string): boolean {
  return toPosix(relPath)
    .split("/")
    .some(
      (segment) =>
        segment.startsWith(".") &&
        segment !== "." &&
        segment !== ".." &&
        !SHARED_HIDDEN_DIRS.has(segment),
    );
}

/**
 * Repositories often ship one skill several times: `pdf/` for everyone plus `.claude/skills/pdf/`
 * and `.cursor/skills/pdf/`. Drop the agent-specific copies of every skill that also has an
 * agent-neutral copy (same skill name), keeping the order. Copies that exist only per agent stay.
 */
export function preferNeutralCopies(root: string, dirs: readonly string[]): string[] {
  const names = new Map(dirs.map((dir) => [dir, readSkillIdentity(dir).name]));
  const specific = (dir: string): boolean => isAgentSpecificPath(relative(root, dir));
  const neutralNames = new Set(dirs.filter((dir) => !specific(dir)).map((dir) => names.get(dir)));
  return dirs.filter((dir) => !specific(dir) || !neutralNames.has(names.get(dir)));
}

/** Skills under a scan root, described for a preview. Agent-specific duplicates are left out. */
export function listRepoSkills(scanRoot: string, options: FindOptions = {}): FoundSkill[] {
  return preferNeutralCopies(scanRoot, findSkillDirs(scanRoot, options)).map((dir) => {
    const identity = readSkillIdentity(dir);
    return {
      dir,
      relPath: toPosix(relative(scanRoot, dir)) || basename(scanRoot),
      name: identity.name,
      description: identity.description,
    };
  });
}

function locate(repoDir: string, locatorId: string): string {
  for (const container of LOCATOR_DIRS) {
    const candidate = join(repoDir, container, locatorId);
    if (isInside(repoDir, candidate) && isSkillDir(candidate)) return candidate;
  }
  // Agent-neutral copies first; the sort is stable, so each group keeps its path order.
  const all = findSkillDirs(repoDir, { maxDepth: LOCATOR_SEARCH_DEPTH }).sort(
    (a, b) =>
      Number(isAgentSpecificPath(relative(repoDir, a))) -
      Number(isAgentSpecificPath(relative(repoDir, b))),
  );
  const match =
    all.find((dir) => basename(dir) === locatorId) ??
    all.find((dir) => readFrontmatter(dir).name === locatorId);
  // Never fall back to a container folder: installing the wrong skill is worse than failing.
  if (!match) throw notFound(`Skill '${locatorId}' was not found in the repository`);
  return match;
}

/**
 * The folder to install (or to scan) inside a checked-out repository.
 * - `subpath` alone: that folder. - `locatorId`: the skill with that folder or frontmatter name.
 * - neither: the root when it is a skill, else `skills/`, else `skill/`, else the root.
 */
export function resolveSkillDir(
  repoDir: string,
  subpath?: string | null,
  locatorId?: string | null,
): string {
  const locator = locatorId?.trim() || null;
  const sub = subpath?.trim().replace(/^[\\/]+|[\\/]+$/g, "") || null;
  let resolved: string | null = null;

  if (sub) {
    const candidate = join(repoDir, sub);
    assertInside(repoDir, candidate, sub);
    if (!locator) {
      if (!isDirectory(candidate)) throw notFound(`Path '${sub}' does not exist in the repository`);
      resolved = candidate;
    } else if (isSkillDir(candidate)) {
      resolved = candidate;
    }
  }
  if (!resolved && locator) resolved = locate(repoDir, locator);
  if (!resolved) {
    resolved = isSkillDir(repoDir)
      ? repoDir
      : (CONTAINER_DIRS.map((name) => join(repoDir, name)).find(isDirectory) ?? repoDir);
  }
  assertInside(repoDir, resolved, toPosix(relative(repoDir, resolved)) || ".");
  return resolved;
}
