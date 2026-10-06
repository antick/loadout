import { compareNames, type SkillFileEntry } from "@loadout/shared";

/**
 * Paths in the editor's file list, all relative to the skill folder and `/` separated. Plain
 * functions, so the list, the name dialog and the actions agree on what a path means.
 */

export interface FolderGroup {
  /** "" for the top of the skill. */
  folder: string;
  files: SkillFileEntry[];
}

/** Names the filesystem or the app keeps for itself. Core refuses them too. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([".", "..", ".git"]);
const FORBIDDEN_CHARS = /[<>:"|?*]/;
const TRAILING_DOT_OR_SPACE = /[.\s]$/;

export type PathProblem = "invalid" | "taken";

/** The folder a path is in; "" at the top. */
export function parentOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** The last part of a path. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `path` is `folder` itself or lies inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Where `path` is after `from` became `to`; null when the rename did not touch it. */
export function movedPath(path: string, from: string, to: string): string | null {
  return isWithin(path, from) ? `${to}${path.slice(from.length)}` : null;
}

/** A typed path the way core reads it: either slash, no empty parts. */
export function normalizePath(input: string): string {
  return input
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

/** Every path already in use, files and folders, compared without case like macOS and Windows. */
export function takenPaths(
  files: readonly Pick<SkillFileEntry, "path">[],
  folders: readonly string[],
): Set<string> {
  const taken = new Set<string>();
  const add = (path: string): void => {
    for (let at = path; at; at = parentOf(at)) taken.add(at.toLowerCase());
  };
  for (const file of files) add(file.path);
  for (const folder of folders) add(folder);
  return taken;
}

/**
 * Why a new path cannot be used; null when it can. `current` is the path being renamed: the
 * same path in another case is then allowed.
 */
export function pathProblem(
  path: string,
  taken: ReadonlySet<string>,
  current?: string,
): PathProblem | null {
  const parts = path.split("/");
  const bad = parts.some(
    (part) =>
      !part ||
      RESERVED_NAMES.has(part.toLowerCase()) ||
      FORBIDDEN_CHARS.test(part) ||
      TRAILING_DOT_OR_SPACE.test(part),
  );
  if (bad) return "invalid";
  const caseOnly =
    current !== undefined && current !== path && current.toLowerCase() === path.toLowerCase();
  return taken.has(path.toLowerCase()) && !caseOnly ? "taken" : null;
}

/**
 * Files grouped under their folder, in path order, with empty folders as groups of their own.
 * The main document is shown on its own and left out.
 */
export function groupByFolder(
  files: readonly SkillFileEntry[],
  folders: readonly string[] = [],
): FolderGroup[] {
  const groups = new Map<string, SkillFileEntry[]>(folders.map((folder) => [folder, []]));
  for (const file of files) {
    if (file.main) continue;
    const folder = parentOf(file.path);
    groups.set(folder, [...(groups.get(folder) ?? []), file]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : compareNames(a, b)))
    .map(([folder, entries]) => ({ folder, files: entries }));
}
