import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { type ExportResult, type Skill, formatBytes } from "@loadout/shared";
import { type Zippable, zipSync } from "fflate";
import { invalid } from "../errors";
import { ARCHIVE_EXTENSIONS } from "../install/archive";
import { isInside, normalizeAbsolutePath, statOrNull, writeFileAtomic } from "../util/fs";
import { listContentFiles } from "../util/hash";

/**
 * Pack library skills into one `.zip` (or `.skill`) file: each skill in a folder named after its
 * library folder, so the file installs again through the archive installer, one skill or several.
 */

/** Same ceiling the archive installer unpacks, so every export can be installed again. */
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const UNIX_HOST = 3;
const MODE_SHIFT = 16;
const REGULAR_FILE = 0o100000;
const FILE_MODE = 0o644;
const EXECUTABLE_MODE = 0o755;
/** Text compresses well; the time saved at higher levels is not worth it for a few files. */
const COMPRESSION_LEVEL = 6;

/** The file an export may write: absolute, an archive name, never inside the library. */
export function exportTarget(destPath: string, skillsDir: string): string {
  const path = normalizeAbsolutePath(destPath, "Export path");
  if (!ARCHIVE_EXTENSIONS.includes(extname(path).toLowerCase())) {
    throw invalid(`Export to a ${ARCHIVE_EXTENSIONS.join(" or ")} file`);
  }
  if (isInside(skillsDir, path)) throw invalid("Export somewhere outside the skill library");
  if (statOrNull(path)?.isDirectory()) throw invalid(`${path} is a folder`);
  return path;
}

/** Write `skills` into the archive at `path` (already checked by {@link exportTarget}). */
export function writeSkillsArchive(skills: readonly Skill[], path: string): ExportResult {
  if (skills.length === 0) throw invalid("Choose at least one skill to export");
  const entries: Zippable = {};
  let total = 0;
  for (const skill of skills) {
    for (const file of listContentFiles(skill.libraryPath)) {
      total += file.size;
      if (total > MAX_EXPORT_BYTES) {
        throw invalid(`The export would be larger than ${formatBytes(MAX_EXPORT_BYTES)}`);
      }
      const mode = REGULAR_FILE | (file.executable ? EXECUTABLE_MODE : FILE_MODE);
      entries[`${skill.dirName}/${file.relativePath}`] = [
        readFileSync(file.absolutePath),
        // `>>> 0`: the file-type bit lands in bit 31, which a plain shift would make negative.
        { os: UNIX_HOST, attrs: (mode << MODE_SHIFT) >>> 0, mtime: file.mtimeMs },
      ];
    }
  }
  const data = zipSync(entries, { level: COMPRESSION_LEVEL });
  writeFileAtomic(path, data);
  return { path, skillCount: skills.length, bytes: data.byteLength };
}
