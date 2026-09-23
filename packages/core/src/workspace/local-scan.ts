import { basename, isAbsolute, join, relative } from "node:path";
import type { BrokenSkillReason, Deployment, Skill, SyncStatus } from "@loadout/shared";
import { readSkillIdentity } from "../skills/metadata";
import {
  canonicalPath,
  isDanglingLink,
  isDirectory,
  isSkillDir,
  linkTargetOf,
  listTopLevel,
  readDirSafe,
  targetIdentity,
  toPosix,
} from "../util/fs";
import { hashDir, newestContentMtime } from "../util/hash";
import { slugify } from "../util/names";

/** A skill folder found under a skills root, before it is compared with the library. */
export interface LocalSkillDir {
  path: string;
  /** Path relative to the scanned root, `/` separated. */
  relativePath: string;
}

/** A found skill folder with everything needed to match and classify it. */
export interface LocalEntry extends LocalSkillDir {
  name: string;
  dirName: string;
  description: string | null;
  files: string[];
  hash: string | null;
  newestMtime: number | null;
}

export interface ScanOptions {
  /** Look through namespace folders until a skill folder is found. Otherwise direct children only. */
  recursive: boolean;
}

/** `strict` never guesses from names (agent folders); `loose` may (project folders). */
export type MatchMode = "strict" | "loose";

/** A folder holding its own `skills/` folder is an embedded plugin bundle, not a namespace. */
const BUNDLE_MARKER_DIR = "skills";
const HIDDEN_PREFIX = ".";
/** Clocks closer than this cannot say which side changed last. */
const MTIME_THRESHOLD_MS = 1000;

const byRelativePath = (a: LocalSkillDir, b: LocalSkillDir): number =>
  a.relativePath.localeCompare(b.relativePath);

/** A folder under a skills root that the agent will not load, before any lookup. */
export interface BrokenDir extends LocalSkillDir {
  reason: BrokenSkillReason;
  /** Where the link points, resolved against its folder. Null for a plain folder. */
  linkTarget: string | null;
}

export interface SkillRootScan {
  skills: LocalSkillDir[];
  broken: BrokenDir[];
}

/**
 * Skill folders under `root`, and the folders the agent ignores. A skill folder is a leaf.
 * Hidden folders are skipped: they are either tooling or our own staging leftovers, never
 * something the agent loads. A plugin bundle (a folder with its own `skills/` folder) and a link
 * back up the tree are neither skills nor broken. A namespace folder is broken only when nothing
 * was found anywhere below it; otherwise what is below it speaks for itself.
 */
export function walkSkillRoot(root: string, options: ScanOptions): SkillRootScan {
  const skills: LocalSkillDir[] = [];
  const broken: BrokenDir[] = [];
  // Canonical paths already walked: a link pointing back up the tree must not loop forever.
  const visited = new Set<string>([canonicalPath(root)]);
  const at = (path: string): LocalSkillDir => ({
    path,
    relativePath: toPosix(relative(root, path)),
  });
  const markBroken = (path: string, reason: BrokenSkillReason): void => {
    broken.push({ ...at(path), reason, linkTarget: linkTargetOf(path) });
  };

  /**
   * How many things below `dir` are more than empty folders: skills, bundles, loops and dangling
   * links. A folder with none of them is reported once, at its top, instead of at every level.
   */
  const walk = (dir: string): number => {
    let found = 0;
    for (const entry of readDirSafe(dir)) {
      if (entry.name.startsWith(HIDDEN_PREFIX)) continue;
      const child = join(dir, entry.name);
      if (!isDirectory(child)) {
        // A link to a file is not a folder at all; only a link to nothing is broken.
        if (isDanglingLink(child)) {
          markBroken(child, "dangling_link");
          found += 1;
        }
        continue;
      }
      if (isSkillDir(child)) {
        skills.push(at(child));
        found += 1;
        continue;
      }
      if (isDirectory(join(child, BUNDLE_MARKER_DIR))) {
        found += 1;
        continue;
      }
      if (!options.recursive) {
        markBroken(child, "missing_document");
        continue;
      }
      const real = canonicalPath(child);
      if (visited.has(real)) {
        found += 1;
        continue;
      }
      visited.add(real);
      const brokenBefore = broken.length;
      const below = walk(child);
      found += below;
      if (below > 0) continue;
      // Only empty folders were marked below; the child itself stands for all of them.
      broken.length = brokenBefore;
      markBroken(child, "missing_document");
    }
    return found;
  };

  walk(root);
  return { skills: skills.sort(byRelativePath), broken: broken.sort(byRelativePath) };
}

/** Skill folders under `root`, sorted by path. */
export function findLocalSkillDirs(root: string, options: ScanOptions): LocalSkillDir[] {
  return walkSkillRoot(root, options).skills;
}

export function describeLocalSkill(dir: LocalSkillDir): LocalEntry {
  const identity = readSkillIdentity(dir.path);
  return {
    ...dir,
    name: identity.name,
    dirName: basename(dir.path),
    description: identity.description,
    files: listTopLevel(dir.path),
    hash: hashDir(dir.path),
    newestMtime: newestContentMtime(dir.path),
  };
}

/** Every skill under `root`, described and sorted by name. */
export function scanSkillRoot(root: string, options: ScanOptions): LocalEntry[] {
  return findLocalSkillDirs(root, options)
    .map(describeLocalSkill)
    .sort((a, b) => a.name.localeCompare(b.name) || byRelativePath(a, b));
}

/** The library, arranged for looking up many local folders without rescanning it each time. */
export interface LibraryIndex {
  /** Deployment targets, local source folders and library folders, literal and canonical. */
  byPath: Map<string, Skill>;
  byHash: Map<string, Skill[]>;
  /** Lowercase library folder name. */
  byDirName: Map<string, Skill[]>;
  bySlug: Map<string, Skill[]>;
}

function push(map: Map<string, Skill[]>, key: string, skill: Skill): void {
  map.set(key, [...(map.get(key) ?? []), skill]);
}

export function indexLibrary(skills: Skill[], deployments: Deployment[]): LibraryIndex {
  const index: LibraryIndex = {
    byPath: new Map(),
    byHash: new Map(),
    byDirName: new Map(),
    bySlug: new Map(),
  };
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  for (const skill of skills) {
    if (skill.contentHash) push(index.byHash, skill.contentHash, skill);
    push(index.byDirName, skill.dirName.toLowerCase(), skill);
    push(index.bySlug, slugify(skill.name), skill);
    // A local folder that is a link into the library resolves to the skill's own folder.
    index.byPath.set(canonicalPath(skill.libraryPath), skill);
    // Only a folder path can name a local copy; git URLs and marketplace ids never do.
    if (skill.sourceRef && isAbsolute(skill.sourceRef)) {
      index.byPath.set(skill.sourceRef, skill);
      index.byPath.set(canonicalPath(skill.sourceRef), skill);
    }
  }
  // Deployments last: what we wrote at a path says more than where a skill once came from.
  for (const deployment of deployments) {
    const skill = byId.get(deployment.skillId);
    if (!skill) continue;
    index.byPath.set(deployment.targetPath, skill);
    index.byPath.set(targetIdentity(deployment.targetPath), skill);
  }
  return index;
}

/** One candidate wins outright; several only when exactly one of them has the entry's content. */
function pickOne(candidates: Skill[] | undefined, hash: string | null): Skill | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const sameContent = candidates.filter((skill) => hash !== null && skill.contentHash === hash);
  return sameContent.length === 1 ? (sameContent[0] ?? null) : null;
}

/**
 * The library skill a local folder belongs to, or null.
 * Both modes: a recorded path (deployment or local source) first, then equal content.
 * `strict` takes the first skill with that content and never looks at names.
 * `loose` needs the content to name exactly one skill, then falls back to the library folder
 * name and finally the slug of the skill name, each compared without case.
 */
export function matchLibrarySkill(
  entry: Pick<LocalEntry, "path" | "dirName" | "hash">,
  library: LibraryIndex,
  mode: MatchMode,
): Skill | null {
  const byPath =
    library.byPath.get(entry.path) ??
    library.byPath.get(targetIdentity(entry.path)) ??
    library.byPath.get(canonicalPath(entry.path));
  if (byPath) return byPath;

  const sameContent = entry.hash ? (library.byHash.get(entry.hash) ?? []) : [];
  if (mode === "strict") return sameContent[0] ?? null;
  if (sameContent.length === 1) return sameContent[0] ?? null;

  const dirName = entry.dirName.toLowerCase();
  return (
    pickOne(library.byDirName.get(dirName), entry.hash) ??
    pickOne(library.bySlug.get(dirName), entry.hash)
  );
}

/**
 * How a local folder compares with its library skill. Equal content is the only proof of being
 * in sync; otherwise the newest content file on each side decides, never the database clock.
 */
export function classifySync(
  entry: Pick<LocalEntry, "hash" | "newestMtime">,
  librarySkill: Skill | null,
): SyncStatus {
  if (!librarySkill) return "local_only";
  if (entry.hash !== null) {
    if (entry.hash === librarySkill.contentHash) return "in_sync";
    // The stored hash can lag behind a hand edit of the library folder.
    if (entry.hash === hashDir(librarySkill.libraryPath)) return "in_sync";
  }
  const libraryMtime = newestContentMtime(librarySkill.libraryPath);
  if (entry.newestMtime === null || libraryMtime === null) return "diverged";
  if (entry.newestMtime > libraryMtime + MTIME_THRESHOLD_MS) return "local_newer";
  if (libraryMtime > entry.newestMtime + MTIME_THRESHOLD_MS) return "library_newer";
  return "diverged";
}
