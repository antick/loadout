import { basename, join, relative } from "node:path";
import { invalid, notFound } from "../errors";
import { type SkillTrait, lastPathSegment, mergeTraits } from "@loadout/shared";
import { readFrontmatter, readSkillIdentity } from "../skills/metadata";
import { folderTraits } from "../skills/traits";
import {
  GIT_DIR,
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
  /** The frontmatter sets `disable-model-invocation: true`. */
  manualOnly: boolean;
  traits: SkillTrait[];
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
  GIT_DIR,
  "node_modules",
  "__MACOSX",
]);
/** Where a named skill usually lives, tried before searching the whole repository. */
const LOCATOR_DIRS = ["", "skills", ".agents/skills"] as const;
const LOCATOR_SEARCH_DEPTH = 6;
/** Hidden folders every agent reads, so a skill inside one is not tied to a single agent. */
const SHARED_HIDDEN_DIRS: ReadonlySet<string> = new Set([".agents"]);

/** Lexically inside, and (once it exists, so links can be followed) really inside too. */
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

/** The skill folder `dir` under a scan root, described for a preview. */
export function describeSkill(scanRoot: string, dir: string): FoundSkill {
  const identity = readSkillIdentity(dir);
  return {
    dir,
    relPath: toPosix(relative(scanRoot, dir)) || basename(scanRoot),
    name: identity.name,
    description: identity.description,
    manualOnly: identity.manualOnly,
    traits: mergeTraits(identity.traits, folderTraits(dir)),
  };
}

/** Skills under a scan root, described for a preview. Agent-specific duplicates are left out. */
export function listRepoSkills(scanRoot: string, options: FindOptions = {}): FoundSkill[] {
  return preferNeutralCopies(scanRoot, findSkillDirs(scanRoot, options)).map((dir) =>
    describeSkill(scanRoot, dir),
  );
}

/** Where a skill named `id` is first looked for, relative to the repository. */
export function usualSkillPaths(id: string): string[] {
  return LOCATOR_DIRS.map((container) => (container ? `${container}/${id}` : id));
}

/**
 * Which of a repository's skill folders (relative, `/`-separated) the name `id` means: the rule
 * install and the marketplace detail share. `found` is the folder its path settles: a usual place,
 * else the first folder of that name, agent-neutral copies first. Otherwise the folders in
 * `byName`, in order, are the ones to check for a frontmatter `name` equal to `id`.
 */
export function locateSkill(
  dirs: readonly string[],
  id: string,
): { found: string | null; byName: string[] } {
  const usual = usualSkillPaths(id).find((path) => dirs.includes(path));
  if (usual !== undefined) return { found: usual, byName: [] };
  // The sort is stable, so each group keeps its path order.
  const ordered = [...dirs].sort(
    (a, b) => Number(isAgentSpecificPath(a)) - Number(isAgentSpecificPath(b)),
  );
  const named = ordered.find((dir) => lastPathSegment(dir) === id);
  return named === undefined ? { found: null, byName: ordered } : { found: named, byName: [] };
}

function locate(repoDir: string, locatorId: string): string {
  const relativeOf = (dir: string): string => toPosix(relative(repoDir, dir));
  // The usual places count even below a skill folder, which the search does not look into.
  const usual = usualSkillPaths(locatorId).filter((path) => {
    const dir = join(repoDir, path);
    return isInside(repoDir, dir) && isSkillDir(dir);
  });
  const found = findSkillDirs(repoDir, { maxDepth: LOCATOR_SEARCH_DEPTH }).map(relativeOf);
  const { found: settled, byName } = locateSkill([...usual, ...found], locatorId);
  const match =
    settled ?? byName.find((dir) => readFrontmatter(join(repoDir, dir)).name === locatorId);
  // Never fall back to a container folder: installing the wrong skill is worse than failing.
  if (match === undefined) throw notFound(`Skill '${locatorId}' was not found in the repository`);
  return join(repoDir, match);
}

/**
 * The folder to install (or to scan) inside a checked-out repository.
 * - `subpath` alone: that folder. - `locatorId`: the skill with that folder or frontmatter name.
 * - neither: the root. A list scans all of it, as the source check does, so a skill outside
 *   `skills/` is offered now instead of turning up as new after the next commit.
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
  if (!resolved) resolved = repoDir;
  assertInside(repoDir, resolved, toPosix(relative(repoDir, resolved)) || ".");
  return resolved;
}
