import { type Stats, readFileSync } from "node:fs";
import type {
  SaveSkillFileInput,
  SaveSkillFileResult,
  Skill,
  SkillFile,
  SkillFileEntry,
  SkillFileVersion,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, invalid, notFound, unsupported } from "../errors";
import {
  canonicalPath,
  isInside,
  lstatOrNull,
  resolveInside,
  toPosix,
  writeFileAtomic,
} from "../util/fs";
import { hashDir, isIgnoredContentName, listContentFiles } from "../util/hash";
import type { FileHistory } from "./history";
import { readSkillDocument, readSkillIdentity } from "./metadata";
import type { SkillStore } from "./store";
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
 * The in-app editor's view of a library skill: list its files, open one as text, and save it
 * back. A save never overwrites a change it has not seen, keeps the previous version, and
 * refreshes the copies deployed to agents unless an agent's copy holds edits of its own.
 */

export interface CopyRefresh {
  written: number;
  /** Agent keys whose copy was left alone because it was edited in place. */
  kept: string[];
}

export interface SkillEditorDeps {
  store: SkillStore;
  history: FileHistory;
  refreshCopies(skill: Skill): Promise<CopyRefresh>;
}

export interface SkillEditor {
  files(skillId: string): SkillFileEntry[];
  readFile(skillId: string, path: string): SkillFile;
  saveFile(skillId: string, input: SaveSkillFileInput): Promise<SaveSkillFileResult>;
  fileVersions(skillId: string, path: string): SkillFileVersion[];
  readFileVersion(skillId: string, path: string, versionId: string): string;
}

const WINDOWS = process.platform === "win32";
const PERMISSION_BITS = 0o7777;

interface LocatedFile {
  /** `/` separated, relative to the skill folder. */
  relative: string;
  absolute: string;
  stat: Stats;
}

/** Split a relative path the way both separators are written, without empty segments. */
function segmentsOf(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

/** Resolve a file of the skill, refusing anything outside it, links and ignored names. */
function locate(skill: Skill, path: unknown): LocatedFile {
  if (typeof path !== "string" || !path.trim()) throw invalid("A file path is required");
  const segments = segmentsOf(path);
  const relative = segments.join("/");
  if (segments.some(isIgnoredContentName)) throw unsupported(`${relative} cannot be edited`);
  const absolute = resolveInside(skill.libraryPath, path);
  const stat = lstatOrNull(absolute);
  if (!stat) throw notFound(`${relative} no longer exists in ${skill.name}`);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw unsupported(`Only regular files can be edited: ${relative}`);
  }
  // A linked folder on the way could lead somewhere else entirely.
  if (!isInside(canonicalPath(skill.libraryPath), canonicalPath(absolute))) {
    throw invalid(`${relative} is outside the skill folder`);
  }
  return { relative, absolute, stat };
}

function mainDocumentOf(skill: Skill): string | null {
  const found = readSkillDocument(skill.libraryPath);
  return found ? toPosix(found.filename) : null;
}

/** Why a file cannot be opened, judged from its size and first bytes. */
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

export function changedOnDisk(path: string, currentHash: string): AppError {
  return new AppError(
    "CHANGED_ON_DISK",
    `${path} changed on disk after you opened it. Reload it, or save again to overwrite it.`,
    { path, currentHash },
  );
}

export function createSkillEditor(ctx: CoreContext, deps: SkillEditorDeps): SkillEditor {
  const { store, history } = deps;

  function readFile(skillId: string, path: string): SkillFile {
    const file = locate(store.get(skillId), path);
    return toSkillFile(file.relative, readLocated(file), file.stat);
  }

  async function saveFile(
    skillId: string,
    input: SaveSkillFileInput,
  ): Promise<SaveSkillFileResult> {
    if (typeof input?.content !== "string") throw invalid("File content is required");
    if (typeof input.baseHash !== "string") throw invalid("The version being edited is missing");
    const name = store.get(skillId).name;

    return ctx.lock.run(`edit ${name}`, async () => {
      const skill = store.get(skillId);
      const file = locate(skill, input.path);
      const current = readLocated(file);
      const currentHash = hashBytes(current);
      if (currentHash !== input.baseHash && !input.overwrite) {
        throw changedOnDisk(file.relative, currentHash);
      }
      const decoded = decodeText(current);
      // Replacing a file that became binary is only ever done on purpose.
      if (!decoded && !input.overwrite) throw changedOnDisk(file.relative, currentHash);
      const next = encodeText(input.content, decoded?.eol ?? "lf", decoded?.bom ?? hasBom(current));
      if (next.length > MAX_EDITABLE_BYTES) throw invalid(`${file.relative} is too large to save`);

      if (next.equals(current)) {
        return {
          skill,
          file: toSkillFile(file.relative, current, file.stat),
          written: false,
          copiesRefreshed: 0,
          copiesKept: [],
        };
      }

      history.record(skill.id, file.relative, current);
      writeFileAtomic(file.absolute, next, WINDOWS ? undefined : file.stat.mode & PERMISSION_BITS);

      const identity = readSkillIdentity(skill.libraryPath);
      const updated = store.update(skill.id, {
        name: identity.name,
        description: identity.description,
        contentHash: hashDir(skill.libraryPath),
        editedFiles: [...skill.editedFiles, file.relative],
      });
      ctx.activity.record("edit", updated.name, file.relative);
      const copies = await deps.refreshCopies(updated);
      ctx.touched("skills");

      const saved = locate(updated, file.relative);
      return {
        skill: store.get(skill.id),
        file: toSkillFile(saved.relative, readFileSync(saved.absolute), saved.stat),
        written: true,
        copiesRefreshed: copies.written,
        copiesKept: copies.kept,
      };
    });
  }

  return {
    files: (skillId) => {
      const skill = store.get(skillId);
      const main = mainDocumentOf(skill);
      const edited = new Set(skill.editedFiles);
      const entries = listContentFiles(skill.libraryPath).map((file): SkillFileEntry => ({
        path: file.relativePath,
        size: file.size,
        locked: lockOf(file.absolutePath, file.size),
        main: file.relativePath === main,
        edited: edited.has(file.relativePath),
      }));
      // Main document first, the rest keep their path order.
      return entries.sort((a, b) => Number(b.main) - Number(a.main));
    },

    readFile,
    saveFile,

    fileVersions: (skillId, path) => {
      const skill = store.get(skillId);
      return history.list(skill.id, segmentsOf(path).join("/"));
    },

    readFileVersion: (skillId, path, versionId) => {
      const skill = store.get(skillId);
      return history.read(skill.id, segmentsOf(path).join("/"), versionId);
    },
  };
}
