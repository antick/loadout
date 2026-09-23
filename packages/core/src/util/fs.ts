import { randomUUID } from "node:crypto";
import {
  type Dirent,
  type Stats,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
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
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { SKILL_MARKER_FILES } from "@loadout/shared";
import { invalid } from "../errors";

/** Names never copied into or out of the library. */
export const COPY_SKIP_NAMES: ReadonlySet<string> = new Set([".git", ".DS_Store"]);

export function expandHome(input: string): string {
  const path = input.trim();
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

/** Expand `~`, require an absolute path, resolve `.` and `..`. */
export function normalizeAbsolutePath(input: string, label = "Path"): string {
  const expanded = expandHome(input);
  if (!expanded) throw invalid(`${label} is required`);
  if (!isAbsolute(expanded)) throw invalid(`${label} must be absolute (or start with ~/)`);
  return normalize(expanded);
}

/** Replace the home directory prefix with `~` for display. */
export function compactHome(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
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

/** Canonical parent + verbatim last segment: identifies a deploy target without following it. */
export function targetIdentity(path: string): string {
  const resolved = resolve(path);
  return join(canonicalPath(dirname(resolved)), resolved.slice(dirname(resolved).length + 1));
}

/** `child` is `parent` or lies inside it (lexical, after resolve). */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function pathsOverlap(a: string, b: string): boolean {
  return isInside(a, b) || isInside(b, a);
}

/** Resolve a user-supplied relative path under `root`, refusing anything that escapes it. */
export function resolveInside(root: string, relativePath: string): string {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) {
    throw invalid(`Invalid relative path: '${relativePath}'`);
  }
  const full = join(root, ...segments);
  if (!isInside(root, full)) throw invalid(`Path escapes its root: '${relativePath}'`);
  return full;
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

/**
 * Replace `target` with `source`'s content through a staged sibling, so a failure midway leaves
 * the original in place.
 */
export async function replaceDirAtomic(source: string, target: string): Promise<void> {
  const parent = dirname(target);
  const name = target.slice(parent.length + 1);
  const staged = join(parent, `.${name}.staged-${randomUUID()}`);
  const backup = join(parent, `.${name}.backup-${randomUUID()}`);
  await copyDir(source, staged, { skipSymlinks: true });
  const hadTarget = lstatOrNull(target) !== null;
  try {
    if (hadTarget) renameSync(target, backup);
    renameSync(staged, target);
  } catch (error) {
    if (hadTarget && !existsSync(target) && existsSync(backup)) renameSync(backup, target);
    await removePath(staged);
    throw error;
  }
  if (hadTarget) await removePath(backup);
}

/**
 * Write through a temp file and rename, so readers never see a half-written file. `mode` sets the
 * permission bits exactly (the umask does not apply), e.g. to keep a script executable.
 */
export function writeFileAtomic(path: string, content: string | Uint8Array, mode?: number): void {
  ensureDir(dirname(path));
  const temp = `${path}.tmp.${randomUUID()}`;
  try {
    writeFileSync(temp, content);
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
