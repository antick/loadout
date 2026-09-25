import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { APP_SLUG, formatBytes } from "@loadout/shared";
import { unzipSync } from "fflate";
import { errorMessage, invalid, isAppError, notFound } from "../errors";
import { isInside, isSkillDir, removePath, resolveInside } from "../util/fs";
import { trySanitizeSkillName } from "../util/names";
import { type FoundSkill, findSkillDirs, listRepoSkills, preferNeutralCopies } from "./repo-scan";
import { isGzip, isTar, readTar } from "./tar";

/** An unpacked archive. Always call `cleanup`. */
export interface ExtractedArchive {
  /** The skill folder inside the archive, or the archive root when it holds no marker file. */
  skillDir: string;
  cleanup(): Promise<void>;
}

/** Archives Loadout writes (export) as well as reads. */
export const ZIP_EXTENSIONS: readonly string[] = [".zip", ".skill"];
/** Read only. `.tar.gz` comes before `.tar` so the longest match wins. */
export const TAR_EXTENSIONS: readonly string[] = [".tar.gz", ".tgz", ".tar"];
export const ARCHIVE_EXTENSIONS: readonly string[] = [...ZIP_EXTENSIONS, ...TAR_EXTENSIONS];
const EXTRACT_DIR_PREFIX = `${APP_SLUG}-archive-`;
const FALLBACK_ARCHIVE_NAME = "archive";
const SKILL_SEARCH_DEPTH = 4;
/** Refuse to unpack more than this: a small zip can expand to fill the disk. */
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b] as const;

// ZIP central directory layout (APPNOTE 4.3.12 / 4.3.16).
const END_SIGNATURE = 0x06054b50;
const ENTRY_SIGNATURE = 0x02014b50;
const END_MIN_LENGTH = 22;
const ENTRY_FIXED_LENGTH = 46;
const HOST_UNIX = 3;
const UTF8_FLAG = 0x800;
const MODE_TYPE_MASK = 0o170000;
const MODE_SYMLINK = 0o120000;
const EXECUTABLE_BITS = 0o111;
const EXECUTABLE_MODE = 0o755;

/** The archive extension `path` ends with (`.tar.gz`, `.zip`, …), or null. */
export function archiveExtension(path: string): string | null {
  const lower = path.toLowerCase();
  return ARCHIVE_EXTENSIONS.find((extension) => lower.endsWith(extension)) ?? null;
}

export function isArchivePath(path: string): boolean {
  return archiveExtension(path) !== null;
}

function isZip(data: Buffer): boolean {
  return data[0] === ZIP_MAGIC[0] && data[1] === ZIP_MAGIC[1];
}

/** Tar by its bytes when they say so, else by the name it came under. */
function isTarData(data: Buffer, name: string): boolean {
  if (isZip(data)) return false;
  if (isGzip(data) || isTar(data)) return true;
  const extension = archiveExtension(name);
  return extension !== null && TAR_EXTENSIONS.includes(extension);
}

/**
 * Unix modes by entry name. The unzip library does not expose them, so read the central directory
 * ourselves. Anything unexpected yields fewer modes, never an error.
 */
function readUnixModes(data: Buffer): Map<string, number> {
  const modes = new Map<string, number>();
  let end = data.length - END_MIN_LENGTH;
  while (end >= 0 && data.readUInt32LE(end) !== END_SIGNATURE) end -= 1;
  if (end < 0) return modes;
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    if (at + ENTRY_FIXED_LENGTH > data.length || data.readUInt32LE(at) !== ENTRY_SIGNATURE) break;
    const host = data.readUInt8(at + 5);
    const flags = data.readUInt16LE(at + 8);
    const nameLength = data.readUInt16LE(at + 28);
    const extraLength = data.readUInt16LE(at + 30);
    const commentLength = data.readUInt16LE(at + 32);
    const mode = data.readUInt32LE(at + 38) >>> 16;
    const nameBytes = data.subarray(at + ENTRY_FIXED_LENGTH, at + ENTRY_FIXED_LENGTH + nameLength);
    if (host === HOST_UNIX && mode !== 0) {
      modes.set(nameBytes.toString(flags & UTF8_FLAG ? "utf8" : "latin1"), mode);
    }
    at += ENTRY_FIXED_LENGTH + nameLength + extraLength + commentLength;
  }
  return modes;
}

/** Relative, `/`-separated and free of `..`, or null for an entry that must not be written. */
function safeEntryPath(name: string): string | null {
  const path = name.replaceAll("\\", "/");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const segments = path.split("/").filter((segment) => segment && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) return null;
  return segments.join("/");
}

/** Write one entry below `root`; `bytes` null means a folder. Unsafe paths are skipped. */
function writeEntry(root: string, name: string, bytes: Uint8Array | null, mode: number): void {
  const relative = safeEntryPath(name);
  if (relative === null) return;
  const target = join(root, relative);
  if (!isInside(root, target)) return;
  if (bytes === null) {
    mkdirSync(target, { recursive: true });
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  if (process.platform !== "win32" && (mode & EXECUTABLE_BITS) !== 0) {
    chmodSync(target, EXECUTABLE_MODE);
  }
}

function unpackTar(data: Buffer, root: string): void {
  const entries = readTar(data, MAX_UNPACKED_BYTES);
  if (entries.length === 0) throw invalid("The archive is empty or damaged");
  mkdirSync(root, { recursive: true });
  for (const entry of entries) {
    writeEntry(root, entry.name, entry.kind === "directory" ? null : entry.data, entry.mode);
  }
}

function unpackZip(data: Buffer, root: string): void {
  const modes = readUnixModes(data);
  let unpacked = 0;
  const files = unzipSync(data, {
    filter: (file) => {
      if (safeEntryPath(file.name) === null) return false;
      // A link inside an archive could point anywhere; skills never need one.
      if (((modes.get(file.name) ?? 0) & MODE_TYPE_MASK) === MODE_SYMLINK) return false;
      unpacked += file.originalSize;
      if (unpacked > MAX_UNPACKED_BYTES) {
        throw invalid(`Archive is larger than ${formatBytes(MAX_UNPACKED_BYTES)} when unpacked`);
      }
      return true;
    },
  });
  mkdirSync(root, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    writeEntry(root, name, name.endsWith("/") ? null : bytes, modes.get(name) ?? 0);
  }
}

/** An archive unpacked into a temp folder. Always call `cleanup`. */
export interface UnpackedArchive {
  /** Folder holding the archive's entries, named after the archive. */
  root: string;
  cleanup(): Promise<void>;
}

/**
 * Unpack archive bytes into a fresh temp folder. `name` (a file name or URL path segment, with or
 * without extension) names the folder, so a skill without a marker or frontmatter name is called
 * after what the user picked rather than after a random temp folder.
 */
export async function unpackArchive(data: Buffer, name: string): Promise<UnpackedArchive> {
  const parent = await mkdtemp(join(tmpdir(), EXTRACT_DIR_PREFIX));
  const cleanup = (): Promise<void> => removePath(parent).catch(() => undefined);
  const file = basename(name);
  const extension = archiveExtension(file) ?? extname(file);
  const stem = file.slice(0, file.length - extension.length);
  const root = join(parent, trySanitizeSkillName(stem) ?? FALLBACK_ARCHIVE_NAME);
  try {
    unpackArchiveInto(data, file, root);
    return { root, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * Unpack archive bytes into `root`, which the caller owns and cleans up. `name` is only a hint for
 * the format when the bytes do not say.
 */
export function unpackArchiveInto(data: Buffer, name: string, root: string): void {
  try {
    if (isTarData(data, name)) unpackTar(data, root);
    else unpackZip(data, root);
  } catch (error) {
    if (isAppError(error)) throw error;
    throw invalid(`Could not read the archive: ${errorMessage(error)}`);
  }
}

/** Read a `.zip`, `.skill`, `.tar`, `.tar.gz` or `.tgz` file from disk and unpack it. */
export async function unpackArchiveFile(archivePath: string): Promise<UnpackedArchive> {
  if (!isArchivePath(archivePath)) {
    throw invalid(`Unsupported archive format: ${extname(archivePath) || basename(archivePath)}`);
  }
  return unpackArchive(await readFile(archivePath), archivePath);
}

/** Every skill folder inside an unpacked archive, one per skill. */
export function archiveSkillDirs(root: string): string[] {
  return preferNeutralCopies(root, findSkillDirs(root, { maxDepth: SKILL_SEARCH_DEPTH }));
}

/** The skills of an unpacked archive, described for a preview. Same set as {@link archiveSkillDirs}. */
export function listArchiveSkills(root: string): FoundSkill[] {
  return listRepoSkills(root, { maxDepth: SKILL_SEARCH_DEPTH });
}

/**
 * The skill folder of an unpacked archive: the folder at `subpath` when one is recorded (archives
 * that hold several skills), else the only skill, else the root when it holds no marker file.
 */
export function archiveSkillDir(root: string, subpath?: string | null): string {
  if (subpath) {
    const dir = resolveInside(root, subpath);
    if (!isSkillDir(dir)) throw notFound(`The archive no longer holds a skill at ${subpath}`);
    return dir;
  }
  const skills = archiveSkillDirs(root);
  if (skills.length > 1) {
    throw invalid("The archive holds several skills. Choose which ones to install.");
  }
  return skills[0] ?? root;
}

/** Unpack an archive file into a temp folder and find the skill inside it. */
export async function extractArchive(
  archivePath: string,
  subpath?: string | null,
): Promise<ExtractedArchive> {
  const archive = await unpackArchiveFile(archivePath);
  try {
    return { skillDir: archiveSkillDir(archive.root, subpath), cleanup: archive.cleanup };
  } catch (error) {
    await archive.cleanup();
    throw error;
  }
}
