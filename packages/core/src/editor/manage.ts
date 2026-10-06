import { type Stats, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { exists, invalid, notFound, unsupported } from "../errors";
import {
  ensureDir,
  isInside,
  lstatOrNull,
  readDirSafe,
  removePathSync,
  segmentsOf,
} from "../util/fs";
import { isIgnoredContentName, listContentFiles } from "../util/hash";
import { isPortableName } from "../util/names";
import { isReallyInside } from "../util/safe-path";
import { type EditableFolder, mainDocumentOf } from "./files";
import type { FileHistory } from "./history";
import { resolveInside } from "../util/safe-path";

/**
 * Creating, renaming and deleting the files and folders of one skill folder. The main document
 * never goes: a skill without it stops being a skill. A deleted file is kept in the history
 * first; nothing lists it afterwards, but a file made again at that path shows those versions.
 * The caller holds the library lock and does the bookkeeping.
 */

/** What a change did. */
export interface FolderChange {
  /** The file or folder created, renamed to, or deleted. */
  path: string;
  /** Content files that were created, moved to or deleted, for the skill's edit marks. */
  files: string[];
}

interface Entry {
  /** `/` separated, relative to the skill folder. */
  relative: string;
  absolute: string;
  /** Null when nothing is there yet. */
  stat: Stats | null;
}

/** Resolve a path in the folder, refusing anything outside it and names that are not content. */
function entryAt(folder: EditableFolder, path: unknown): Entry {
  if (typeof path !== "string" || !path.trim()) throw invalid("A path is required");
  if (folder.only !== undefined) throw unsupported(`Files cannot be added to ${folder.label}`);
  const segments = segmentsOf(path);
  const relative = segments.join("/");
  if (segments.some(isIgnoredContentName)) throw unsupported(`${relative} cannot be changed here`);
  const absolute = resolveInside(folder.dir, path);
  if (!isReallyInside(folder.dir, absolute))
    throw invalid(`${relative} is outside the skill folder`);
  return { relative, absolute, stat: lstatOrNull(absolute) };
}

/** An existing file or folder; links are left alone like everywhere in the editor. */
function existingAt(folder: EditableFolder, path: unknown): Entry & { stat: Stats } {
  const entry = entryAt(folder, path);
  const { stat } = entry;
  if (!stat) throw notFound(`${entry.relative} no longer exists in ${folder.label}`);
  if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory())) {
    throw unsupported(`Only files and folders can be changed: ${entry.relative}`);
  }
  return { ...entry, stat };
}

function refuseUnportable(relative: string): void {
  for (const name of segmentsOf(relative)) {
    if (!isPortableName(name)) throw invalid(`"${name}" cannot be used as a file or folder name`);
  }
}

/** A place for something new: every name portable, nothing there yet, folders on the way. */
function freeAt(folder: EditableFolder, path: unknown): Entry {
  const entry = entryAt(folder, path);
  refuseUnportable(entry.relative);
  if (entry.stat) throw exists(`${entry.relative} already exists in ${folder.label}`);
  let parent = dirname(entry.absolute);
  while (!lstatOrNull(parent)) parent = dirname(parent);
  if (!lstatOrNull(parent)?.isDirectory()) {
    throw invalid(`${entry.relative} would be inside a file`);
  }
  return entry;
}

/** The main document, or the folder holding it. Compared without case, as macOS and Windows do. */
function refuseMainDocument(folder: EditableFolder, relative: string): void {
  const main = mainDocumentOf(folder.dir)?.toLowerCase();
  const path = relative.toLowerCase();
  if (main && (main === path || main.startsWith(`${path}/`))) {
    throw invalid(`${relative} holds the skill's main document, which a skill cannot be without`);
  }
}

/** Content files of an entry, `/` separated and relative to the skill folder. */
function contentFilesOf(entry: Entry & { stat: Stats }): string[] {
  if (entry.stat.isFile()) return [entry.relative];
  return listContentFiles(entry.absolute).map((file) => `${entry.relative}/${file.relativePath}`);
}

/** Every folder of the skill, empty ones included, by path. Links are not followed. */
export function listFolders(dir: string): string[] {
  const folders: string[] = [];
  const walk = (absolute: string, prefix: string): void => {
    for (const entry of readDirSafe(absolute)) {
      if (!entry.isDirectory() || isIgnoredContentName(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      folders.push(relative);
      walk(join(absolute, entry.name), relative);
    }
  };
  walk(dir, "");
  return folders.sort();
}

export function createFileIn(folder: EditableFolder, path: string): FolderChange {
  const entry = freeAt(folder, path);
  ensureDir(dirname(entry.absolute));
  // `wx` refuses a file that appeared in the meantime instead of emptying it.
  writeFileSync(entry.absolute, "", { flag: "wx" });
  return { path: entry.relative, files: [entry.relative] };
}

export function createFolderIn(folder: EditableFolder, path: string): FolderChange {
  const entry = freeAt(folder, path);
  mkdirSync(entry.absolute, { recursive: true });
  return { path: entry.relative, files: [] };
}

/** Rename or move a file or folder. Changing only the case of a name is allowed. */
export function renameIn(folder: EditableFolder, from: string, to: string): FolderChange {
  const source = existingAt(folder, from);
  refuseMainDocument(folder, source.relative);
  const target = entryAt(folder, to);
  // On a system that ignores case, `notes.md` → `Notes.md` finds the source itself.
  const sameEntry =
    target.stat !== null &&
    target.relative !== source.relative &&
    target.stat.ino === source.stat.ino &&
    target.stat.dev === source.stat.dev;
  if (sameEntry) refuseUnportable(target.relative);
  else freeAt(folder, to);
  if (source.stat.isDirectory() && isInside(source.absolute, target.absolute)) {
    throw invalid(`${source.relative} cannot be moved into itself`);
  }
  const moved = contentFilesOf(source).map(
    (file) => `${target.relative}${file.slice(source.relative.length)}`,
  );
  ensureDir(dirname(target.absolute));
  renameSync(source.absolute, target.absolute);
  return { path: target.relative, files: moved };
}

/** Delete a file or folder, keeping every file in the history first. */
export function deleteIn(folder: EditableFolder, path: string, history: FileHistory): FolderChange {
  const entry = existingAt(folder, path);
  refuseMainDocument(folder, entry.relative);
  const files = contentFilesOf(entry);
  for (const file of files) {
    history.record(folder.historyKey, file, readFileSync(join(folder.dir, ...segmentsOf(file))));
  }
  removePathSync(entry.absolute);
  return { path: entry.relative, files };
}
