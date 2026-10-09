import { randomUUID } from "node:crypto";
import {
  type Dirent,
  type Stats,
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { SKILL_MARKER_FILES } from "@loadout/shared";
import { invalid } from "../errors";

/** The folder a git repository keeps its data in. */
export const GIT_DIR = ".git";
export const GIT_IGNORE_FILE = ".gitignore";
/** Names never copied into or out of the library. */
const COPY_SKIP_NAMES: ReadonlySet<string> = new Set([GIT_DIR, ".DS_Store"]);

/** A name copying leaves behind: everything else travels with a skill. */
export function isNeverCopiedName(name: string): boolean {
  return COPY_SKIP_NAMES.has(name);
}

/** `~` and `~/x` as the home directory; anything else unchanged. */
export function expandHome(input: string, home = homedir()): string {
  const path = input.trim();
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
  return path;
}

/** Expand `~`, require an absolute path, resolve `.` and `..`. */
export function normalizeAbsolutePath(input: string, label = "Path"): string {
  const expanded = expandHome(input);
  if (!expanded) throw invalid(`${label} is required`);
  if (!isAbsolute(expanded)) throw invalid(`${label} must be absolute (or start with ~/)`);
  return normalize(expanded);
}

export function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** Where the link at `path` points, resolved against its folder. Null when it is not a link. */
export function linkTargetOf(path: string): string | null {
  if (!lstatOrNull(path)?.isSymbolicLink()) return null;
  try {
    return resolve(dirname(path), readlinkSync(path));
  } catch {
    return null;
  }
}

/** A link whose target does not exist (any more). */
export function isDanglingLink(path: string): boolean {
  return (lstatOrNull(path)?.isSymbolicLink() ?? false) && !existsSync(path);
}

export function statOrNull(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

export function isDirectory(path: string): boolean {
  return statOrNull(path)?.isDirectory() ?? false;
}

/** Real path when it resolves, the normalised input otherwise. Safe on dangling links. */
export function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * The real path of `path`, following links in whatever part of it exists yet: two spellings of
 * one place (`/var` and `/private/var`, a linked parent) compare equal before the folder is made.
 */
export function realPathOf(path: string): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (!lstatOrNull(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    rest.unshift(basename(existing));
    existing = parent;
  }
  return join(canonicalPath(existing), ...rest);
}

/** Canonical parent + verbatim last segment: identifies a deploy target without following it. */
export function targetIdentity(path: string): string {
  const resolved = resolve(path);
  return join(canonicalPath(dirname(resolved)), resolved.slice(dirname(resolved).length + 1));
}

/** Two paths name one entry on disk (a case-insensitive file system, a linked folder). */
export function sameEntry(a: string, b: string): boolean {
  if (targetIdentity(a) === targetIdentity(b)) return true;
  const left = lstatOrNull(a);
  const right = lstatOrNull(b);
  return left !== null && right !== null && left.dev === right.dev && left.ino === right.ino;
}

/** `child` is `parent` or lies inside it (lexical, after resolve). */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  // `..notes.md` is a name inside; only `..` itself, or `..` followed by a separator, leads out.
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function pathsOverlap(a: string, b: string): boolean {
  return isInside(a, b) || isInside(b, a);
}

/** Split a relative path the way both separators are written, without empty segments. */
export function segmentsOf(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

export function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function readDirSafe(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** A folder holding `SKILL.md` or `skill.md` as a regular file (exact case). */
export function isSkillDir(path: string): boolean {
  const names = new Set(
    readDirSafe(path)
      .filter((e) => e.isFile())
      .map((e) => e.name),
  );
  return SKILL_MARKER_FILES.some((marker) => names.has(marker));
}

/** Remove a file, link or folder. Links are unlinked, never followed. */
export async function removePath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export function removePathSync(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/** Copy one entry whole, folders recursively. Links are copied as links, never followed. */
export function copyEntrySync(from: string, to: string): void {
  cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}

export interface MoveOptions {
  /**
   * Across disks the entry is copied, then the original removed. When that removal fails the
   * copy is already whole: called with the error instead of throwing, so a caller never throws
   * away the only complete copy. Without it, the error is thrown as before.
   */
  onLeftover?: (error: unknown) => void;
}

/**
 * Move one entry, by rename when possible and by copy across disks. Keeps links as links. Never
 * copies into something already at `to`: that rename error is thrown as it is. A copy that fails
 * halfway is removed again, so the source stays the one whole copy.
 */
export function moveEntrySync(from: string, to: string, options: MoveOptions = {}): void {
  try {
    renameSync(from, to);
    return;
  } catch (error) {
    if (lstatOrNull(to)) throw error;
  }
  try {
    copyEntrySync(from, to);
  } catch (error) {
    removePathSync(to);
    throw error;
  }
  try {
    removePathSync(from);
  } catch (error) {
    if (!options.onLeftover) throw error;
    options.onLeftover(error);
  }
}

export interface CopyOptions {
  /** Skip symbolic links entirely (library imports do; deploy copies do not need to). */
  skipSymlinks?: boolean;
}

/** Recursive copy that never carries `.git` or `.DS_Store`, and refuses nested source/target. */
export async function copyDir(
  source: string,
  target: string,
  options: CopyOptions = {},
): Promise<void> {
  if (pathsOverlap(source, target)) {
    throw invalid(`Cannot copy between nested folders: ${source} → ${target}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    dereference: false,
    verbatimSymlinks: true,
    filter: (src) => {
      const name = src.slice(src.lastIndexOf(sep) + 1);
      if (COPY_SKIP_NAMES.has(name)) return false;
      if (options.skipSymlinks && src !== source && lstatOrNull(src)?.isSymbolicLink())
        return false;
      return true;
    },
  });
}

export interface ReplaceDirOptions extends CopyOptions {
  /**
   * Take over the replaced content (moved to a hidden sibling) instead of deleting it. Called
   * only once the new content is in place; it must move or remove the sibling.
   */
  keepReplaced?: (replaced: string) => void;
}

/**
 * Replace `target` with `source`'s content through a staged sibling, so a failure midway leaves
 * the original in place, or nothing when there was none. Links inside are skipped unless
 * `skipSymlinks` is false.
 */
export async function replaceDirAtomic(
  source: string,
  target: string,
  options: ReplaceDirOptions = {},
): Promise<void> {
  const parent = dirname(target);
  const name = target.slice(parent.length + 1);
  const staged = join(parent, `.${name}.staged-${randomUUID()}`);
  const backup = join(parent, `.${name}.backup-${randomUUID()}`);
  try {
    await copyDir(source, staged, { skipSymlinks: options.skipSymlinks ?? true });
  } catch (error) {
    await removePath(staged);
    throw error;
  }
  const hadTarget = lstatOrNull(target) !== null;
  try {
    if (hadTarget) renameSync(target, backup);
    renameSync(staged, target);
  } catch (error) {
    if (hadTarget && !existsSync(target) && existsSync(backup)) renameSync(backup, target);
    await removePath(staged);
    throw error;
  }
  if (!hadTarget) return;
  if (options.keepReplaced) options.keepReplaced(backup);
  else await removePath(backup);
}

/**
 * Write through a temp file and rename, so readers never see a half-written file. `mode` sets the
 * permission bits exactly (the umask does not apply), e.g. to keep a script executable. The temp
 * file is created with `mode` already, so a private file is never readable by others, even for
 * a moment.
 */
export function writeFileAtomic(path: string, content: string | Uint8Array, mode?: number): void {
  ensureDir(dirname(path));
  const temp = `${path}.tmp.${randomUUID()}`;
  try {
    writeFileSync(temp, content, mode === undefined ? undefined : { mode });
    if (mode !== undefined) chmodSync(temp, mode);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** A file's text; null when it cannot be read. */
export function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** A file read as JSON; null when it cannot be read or is not JSON. */
export function readJsonOrNull(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Top-level entry names of a folder, folders suffixed with `/`, sorted. */
export function listTopLevel(path: string): string[] {
  return readDirSafe(path)
    .filter((e) => !COPY_SKIP_NAMES.has(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort((a, b) => a.localeCompare(b));
}

/** Total size in bytes of every regular file under `path`. */
export function dirSize(path: string): number {
  let total = 0;
  for (const entry of readDirSafe(path)) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += statOrNull(full)?.size ?? 0;
  }
  return total;
}

/** Mode of a file anyone may read and its owner write. */
export const FILE_MODE = 0o644;
/** The same, and anyone may run it. */
export const EXECUTABLE_MODE = 0o755;
const EXECUTABLE_BITS = 0o111;

/** A file mode that lets someone run the file. Windows has no such bit: always false there. */
export function isExecutableMode(mode: number): boolean {
  return process.platform !== "win32" && (mode & EXECUTABLE_BITS) !== 0;
}

/** Bytes a file, or everything in a folder, takes; 0 when nothing is there. */
export function pathSize(path: string): number {
  const stat = statOrNull(path);
  if (!stat) return 0;
  return stat.isDirectory() ? dirSize(path) : stat.size;
}
