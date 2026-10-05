import { type Stats, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  NEW_FILE_HASH,
  type SaveSkillFileInput,
  type SkillFile,
  type SkillFileEntry,
} from "@loadout/shared";
import { AppError, invalid, notFound, unsupported } from "../errors";
import { readSkillDocument } from "../skills/metadata";
import {
  canonicalPath,
  ensureDir,
  isInside,
  lstatOrNull,
  resolveInside,
  toPosix,
  writeFileAtomic,
} from "../util/fs";
import { isIgnoredContentName, listContentFiles } from "../util/hash";
import type { FileHistory } from "./history";
import {
  MAX_EDITABLE_BYTES,
  SNIFF_BYTES,
  decodeText,
  encodeText,
  hashBytes,
  hasBom,
  looksBinary,
} from "./text-file";

/**
 * Reading and writing the text files of one skill folder, wherever it lives. A write never
 * overwrites a change it has not seen and keeps the previous version. What else a save means
 * (library bookkeeping, other copies) is the caller's business.
 */

const WINDOWS = process.platform === "win32";
const PERMISSION_BITS = 0o7777;

/** A skill folder opened for editing. `label` names it in messages. */
export interface EditableFolder {
  dir: string;
  label: string;
  /** Key of this folder's earlier versions in the file history. */
  historyKey: string;
  /** Only this file of the folder can be listed or edited (an instruction file in `~/.claude`). */
  only?: string;
  /**
   * `only` may not exist yet: it then reads as a new, empty file, and the first save creates it
   * (and its folders). Nothing is written before that save.
   */
  creatable?: boolean;
}

export interface LocatedFile {
  /** `/` separated, relative to the skill folder. */
  relative: string;
  absolute: string;
  stat: Stats;
}

export interface WriteOutcome {
  file: SkillFile;
  written: boolean;
  /** The bytes the file held before the write. */
  before: Buffer;
  /** The bytes written (equal to `before` when nothing was written). */
  after: Buffer;
}

/** A file of a `creatable` folder that is not on disk yet. */
interface MissingFile {
  relative: string;
  absolute: string;
}

/** Split a relative path the way both separators are written, without empty segments. */
export function segmentsOf(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

/** The `/` separated path of a file the folder may hold; refuses ignored names and other files. */
function relativeIn(folder: EditableFolder, path: unknown): string {
  if (typeof path !== "string" || !path.trim()) throw invalid("A file path is required");
  const segments = segmentsOf(path);
  const relative = segments.join("/");
  if (segments.some(isIgnoredContentName)) throw unsupported(`${relative} cannot be edited`);
  if (folder.only !== undefined && relative !== folder.only) {
    throw invalid(`${relative} is not part of ${folder.label}`);
  }
  return relative;
}

/** The folder's one file when it may be created and nothing is there yet; null otherwise. */
function missingIn(folder: EditableFolder, path: unknown): MissingFile | null {
  if (!folder.creatable) return null;
  const relative = relativeIn(folder, path);
  const absolute = resolveInside(folder.dir, relative);
  return lstatOrNull(absolute) ? null : { relative, absolute };
}

/** Resolve a file of the folder, refusing anything outside it, links and ignored names. */
function locate(folder: EditableFolder, path: unknown): LocatedFile {
  const relative = relativeIn(folder, path);
  const absolute = resolveInside(folder.dir, relative);
  const stat = lstatOrNull(absolute);
  if (!stat) throw notFound(`${relative} no longer exists in ${folder.label}`);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw unsupported(`Only regular files can be edited: ${relative}`);
  }
  if (!staysInside(folder.dir, absolute)) throw invalid(`${relative} is outside the skill folder`);
  return { relative, absolute, stat };
}

/**
 * Whether `absolute` really lies in `dir`, judged from its nearest part that exists: a linked
 * folder on the way could lead somewhere else entirely.
 */
export function staysInside(dir: string, absolute: string): boolean {
  let existing = absolute;
  while (!lstatOrNull(existing) && dirname(existing) !== existing) existing = dirname(existing);
  return isInside(canonicalPath(dir), canonicalPath(existing));
}

/** Why a file cannot be opened, judged from its size and bytes. */
function lockOf(absolute: string, size: number): SkillFileEntry["locked"] {
  if (size > MAX_EDITABLE_BYTES) return "too_large";
  try {
    const bytes = readFileSync(absolute);
    return looksBinary(bytes.subarray(0, SNIFF_BYTES)) || !decodeText(bytes) ? "binary" : null;
  } catch {
    return "binary";
  }
}

function toSkillFile(relative: string, bytes: Buffer, stat: Stats): SkillFile {
  const decoded = decodeText(bytes);
  if (!decoded) throw unsupported(`${relative} is not a text file, so it cannot be edited`);
  return {
    path: relative,
    content: decoded.content,
    hash: hashBytes(bytes),
    eol: decoded.eol,
    modifiedAt: stat.mtimeMs,
  };
}

function readLocated(file: LocatedFile): Buffer {
  if (file.stat.size > MAX_EDITABLE_BYTES) {
    throw unsupported(`${file.relative} is too large to edit here`);
  }
  return readFileSync(file.absolute);
}

function changedOnDisk(path: string, currentHash: string): AppError {
  return new AppError(
    "CHANGED_ON_DISK",
    `${path} changed on disk after you opened it. Reload it, or save again to overwrite it.`,
    { path, currentHash },
  );
}

/** The files of an opened folder: its one file when it is limited to one, else every file. */
export function listFolderFiles(
  folder: EditableFolder,
  edited: ReadonlySet<string> = new Set(),
): SkillFileEntry[] {
  if (folder.only === undefined) return listFiles(folder.dir, edited);
  const missing = missingIn(folder, folder.only);
  if (missing) {
    return [{ path: missing.relative, size: 0, locked: null, main: true, edited: false }];
  }
  const file = locate(folder, folder.only);
  return [
    {
      path: file.relative,
      size: file.stat.size,
      locked: lockOf(file.absolute, file.stat.size),
      main: true,
      edited: edited.has(file.relative),
    },
  ];
}

/** The skill's main document, `/` separated and relative to its folder; null when it has none. */
export function mainDocumentOf(dir: string): string | null {
  const found = readSkillDocument(dir);
  return found ? toPosix(found.filename) : null;
}

/** Every content file of the folder, main document first. */
function listFiles(dir: string, edited: ReadonlySet<string> = new Set()): SkillFileEntry[] {
  const main = mainDocumentOf(dir);
  const entries = listContentFiles(dir).map((file): SkillFileEntry => ({
    path: file.relativePath,
    size: file.size,
    locked: lockOf(file.absolutePath, file.size),
    main: file.relativePath === main,
    edited: edited.has(file.relativePath),
  }));
  // Main document first, the rest keep their path order.
  return entries.sort((a, b) => Number(b.main) - Number(a.main));
}

export function readFileAt(folder: EditableFolder, path: string): SkillFile {
  const missing = missingIn(folder, path);
  if (missing) {
    const empty = { content: "", hash: NEW_FILE_HASH, eol: "lf", modifiedAt: 0 } as const;
    return { path: missing.relative, ...empty, isNew: true };
  }
  const file = locate(folder, path);
  return toSkillFile(file.relative, readLocated(file), file.stat);
}

/** Write one file in the folder's own conventions. The caller holds the library lock. */
export function writeFileAt(
  folder: EditableFolder,
  input: SaveSkillFileInput,
  history: FileHistory,
): WriteOutcome {
  if (typeof input?.content !== "string") throw invalid("File content is required");
  if (typeof input.baseHash !== "string") throw invalid("The version being edited is missing");
  const missing = missingIn(folder, input.path);
  if (missing) return createFileAt(folder, missing, input);
  const file = locate(folder, input.path);
  const current = readLocated(file);
  const currentHash = hashBytes(current);
  if (currentHash !== input.baseHash && !input.overwrite) {
    throw changedOnDisk(file.relative, currentHash);
  }
  const decoded = decodeText(current);
  // Replacing a file that became binary is only ever done on purpose.
  if (!decoded && !input.overwrite) throw changedOnDisk(file.relative, currentHash);
  const next = encodeText(
    input.content,
    decoded?.eol ?? "lf",
    decoded?.bom ?? hasBom(current),
    decoded?.raw,
  );
  if (next.length > MAX_EDITABLE_BYTES) throw invalid(`${file.relative} is too large to save`);

  if (next.equals(current)) {
    return {
      file: toSkillFile(file.relative, current, file.stat),
      written: false,
      before: current,
      after: current,
    };
  }
  history.record(folder.historyKey, file.relative, current);
  writeFileAtomic(file.absolute, next, WINDOWS ? undefined : file.stat.mode & PERMISSION_BITS);
  const saved = locate(folder, file.relative);
  return {
    file: toSkillFile(saved.relative, readFileSync(saved.absolute), saved.stat),
    written: true,
    before: current,
    after: next,
  };
}

/**
 * The first save of a file that was not on disk: its folders are made, and the file is written
 * only if it still does not exist, so a file created meanwhile is never overwritten unseen.
 */
function createFileAt(
  folder: EditableFolder,
  missing: MissingFile,
  input: SaveSkillFileInput,
): WriteOutcome {
  // The editor had an existing file open, deleted since: a change on disk like any other.
  if (input.baseHash !== NEW_FILE_HASH && !input.overwrite) {
    throw changedOnDisk(missing.relative, NEW_FILE_HASH);
  }
  const next = encodeText(input.content, "lf", false);
  if (next.length > MAX_EDITABLE_BYTES) throw invalid(`${missing.relative} is too large to save`);
  ensureDir(dirname(missing.absolute));
  if (!staysInside(folder.dir, missing.absolute)) {
    throw invalid(`${missing.relative} is outside the skill folder`);
  }
  try {
    writeFileSync(missing.absolute, next, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw changedOnDisk(missing.relative, hashBytes(readFileSync(missing.absolute)));
  }
  const saved = locate(folder, missing.relative);
  return {
    file: toSkillFile(saved.relative, readFileSync(saved.absolute), saved.stat),
    written: true,
    before: Buffer.alloc(0),
    after: next,
  };
}

/**
 * Give another copy the same change, but only when its file held exactly what the edited copy
 * held before: then nothing of its own is lost. Returns whether it was written.
 */
export function applyToCopy(
  copy: EditableFolder,
  relative: string,
  before: Buffer,
  after: Buffer,
  history: FileHistory,
): boolean {
  let file: LocatedFile;
  try {
    file = locate(copy, relative);
  } catch {
    return false;
  }
  const current = readFileSync(file.absolute);
  if (!current.equals(before)) return current.equals(after);
  history.record(copy.historyKey, file.relative, current);
  writeFileAtomic(file.absolute, after, WINDOWS ? undefined : file.stat.mode & PERMISSION_BITS);
  return true;
}
