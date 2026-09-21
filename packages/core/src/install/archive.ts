import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { APP_SLUG, formatBytes } from "@loadout/shared";
import { unzipSync } from "fflate";
import { errorMessage, invalid, isAppError } from "../errors";
import { isInside, removePath } from "../util/fs";
import { trySanitizeSkillName } from "../util/names";
import { findSkillDirs, preferNeutralCopies } from "./repo-scan";

/** An unpacked archive. Always call `cleanup`. */
export interface ExtractedArchive {
  /** The skill folder inside the archive, or the archive root when it holds no marker file. */
  skillDir: string;
  cleanup(): Promise<void>;
}

export const ARCHIVE_EXTENSIONS: readonly string[] = [".zip", ".skill"];
const EXTRACT_DIR_PREFIX = `${APP_SLUG}-archive-`;
const FALLBACK_ARCHIVE_NAME = "archive";
const SKILL_SEARCH_DEPTH = 4;
/** Refuse to unpack more than this: a small zip can expand to fill the disk. */
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;

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

export function isArchivePath(path: string): boolean {
  return ARCHIVE_EXTENSIONS.includes(extname(path).toLowerCase());
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

/** Relative, `/`-separated and free of `..` — or null for an entry that must not be written. */
function safeEntryPath(name: string): string | null {
  const path = name.replaceAll("\\", "/");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const segments = path.split("/").filter((segment) => segment && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) return null;
  return segments.join("/");
}

function unpack(data: Buffer, root: string): void {
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
    const relative = safeEntryPath(name);
    if (relative === null) continue;
    const target = join(root, relative);
    if (!isInside(root, target)) continue;
    if (name.endsWith("/")) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    const mode = modes.get(name) ?? 0;
    if (process.platform !== "win32" && (mode & EXECUTABLE_BITS) !== 0) {
      chmodSync(target, EXECUTABLE_MODE);
    }
  }
}

/** Unpack a `.zip` / `.skill` file into a temp folder and find the one skill inside it. */
export async function extractArchive(archivePath: string): Promise<ExtractedArchive> {
  if (!isArchivePath(archivePath)) {
    throw invalid(`Unsupported archive format: ${extname(archivePath) || basename(archivePath)}`);
  }
  const parent = await mkdtemp(join(tmpdir(), EXTRACT_DIR_PREFIX));
  const cleanup = (): Promise<void> => removePath(parent).catch(() => undefined);
  // The unpack folder carries the archive's name, so a skill without a marker or frontmatter name
  // is called after the file the user picked rather than after a random temp folder.
  const stem = basename(archivePath, extname(archivePath));
  const root = join(parent, trySanitizeSkillName(stem) ?? FALLBACK_ARCHIVE_NAME);
  try {
    try {
      unpack(await readFile(archivePath), root);
    } catch (error) {
      if (isAppError(error)) throw error;
      throw invalid(`Could not read the archive: ${errorMessage(error)}`);
    }
    const skills = preferNeutralCopies(root, findSkillDirs(root, { maxDepth: SKILL_SEARCH_DEPTH }));
    if (skills.length > 1) throw invalid("Multiple skill directories found in archive");
    return { skillDir: skills[0] ?? root, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
