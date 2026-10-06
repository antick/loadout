import { join } from "node:path";
import { invalid } from "../errors";
import { isInside, realPathOf, segmentsOf } from "./fs";

/**
 * Every check that a name or path from outside (another device's metadata, a repository, a
 * download, the user) stays where it is put. Kept in one place so they cannot drift apart.
 */

/** One name that cannot step out of the folder it is joined to: no separator, `.`, `..` or NUL. */
export function isPlainName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !/[\\/\0]/.test(name)
  );
}

/**
 * A skill folder name from another device, a repository or a file: one plain name, and not
 * hidden, so it can never point at our own metadata or outside the skills folder.
 */
export function isSkillFolderName(name: unknown): name is string {
  return isPlainName(name) && !name.startsWith(".");
}

/** A relative, `/` separated path that stays inside the folder it is relative to. */
export function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every(isPlainName);
}

/** Resolve a user-supplied relative path under `root`, refusing anything that escapes it. */
export function resolveInside(root: string, relativePath: string): string {
  const segments = segmentsOf(relativePath);
  if (segments.length === 0 || !segments.every(isPlainName)) {
    throw invalid(`Invalid relative path: '${relativePath}'`);
  }
  const full = join(root, ...segments);
  if (!isInside(root, full)) throw invalid(`Path escapes its root: '${relativePath}'`);
  return full;
}

/**
 * `path` really lies in `root`, links followed in whatever part of it exists: a linked folder on
 * the way could lead somewhere else entirely.
 */
export function isReallyInside(root: string, path: string): boolean {
  return isInside(realPathOf(root), realPathOf(path));
}
