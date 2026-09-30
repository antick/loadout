import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLISH_MAX_FILE_BYTES } from "@loadout/shared";
import { lstatOrNull, readDirSafe } from "../util/fs";
import { isIgnoredContentName } from "../util/hash";

/**
 * The files of a skill folder that go into a published copy. Dependencies, local secrets, logs
 * and links stay behind: a repository other people read is not the place for them.
 */

const EXECUTABLE_BITS = 0o111;
/** Folders never published. Their names are what the user sees as "left out". */
const LEFT_OUT_DIRS: ReadonlySet<string> = new Set(["node_modules", ".venv"]);
const ENV_FILE = /^\.env(?:\..+)?$/i;
/** `.env.example` documents the variables; it holds no values. */
const ENV_TEMPLATE = /\.(?:example|sample|template)$/i;
const LOG_FILE = /\.log$/i;

export interface PublishFile {
  /** Path inside the skill folder, `/` separated. */
  relativePath: string;
  absolutePath: string;
  executable: boolean;
  size: number;
}

export interface CollectedFiles {
  files: PublishFile[];
  /** Entries not copied, `/`-separated paths (a folder ends with `/`). */
  leftOut: string[];
  /** The first file larger than {@link PUBLISH_MAX_FILE_BYTES}. */
  tooLarge: string | null;
}

function leftOutFile(name: string): boolean {
  return (ENV_FILE.test(name) && !ENV_TEMPLATE.test(name)) || LOG_FILE.test(name);
}

const isExecutable = (mode: number): boolean =>
  process.platform !== "win32" && (mode & EXECUTABLE_BITS) !== 0;

/** Every file of the skill that would be published, sorted by path. */
export function collectFiles(root: string): CollectedFiles {
  const files: PublishFile[] = [];
  const leftOut: string[] = [];
  let tooLarge: string | null = null;

  const walk = (dir: string, prefix: string): void => {
    for (const entry of readDirSafe(dir)) {
      if (isIgnoredContentName(entry.name)) continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(dir, entry.name);
      const stat = lstatOrNull(absolutePath);
      if (!stat) continue;
      if (stat.isSymbolicLink()) {
        leftOut.push(relativePath);
      } else if (stat.isDirectory()) {
        if (LEFT_OUT_DIRS.has(entry.name)) leftOut.push(`${relativePath}/`);
        else walk(absolutePath, relativePath);
      } else if (stat.isFile()) {
        if (leftOutFile(entry.name)) {
          leftOut.push(relativePath);
          continue;
        }
        if (stat.size > PUBLISH_MAX_FILE_BYTES) tooLarge ??= relativePath;
        files.push({
          relativePath,
          absolutePath,
          executable: isExecutable(stat.mode),
          size: stat.size,
        });
      }
    }
  };
  walk(root, "");
  files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
  return { files, leftOut, tooLarge };
}

/** Bytes plus the executable bit, per path: what "same files" means for a published copy. */
function digest(path: string, executable: boolean): string {
  const hash = createHash("sha256").update(readFileSync(path));
  return `${hash.digest("hex")}${executable ? "x" : "-"}`;
}

export function digestsOf(files: readonly PublishFile[]): Map<string, string> {
  return new Map(
    files.map((file) => [file.relativePath, digest(file.absolutePath, file.executable)]),
  );
}

/** The files already in the repository under `dir`, by the same measure; empty when absent. */
export function digestsInTree(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (current: string, prefix: string): void => {
    for (const entry of readDirSafe(current)) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(current, entry.name);
      const stat = lstatOrNull(absolutePath);
      if (!stat) continue;
      if (stat.isDirectory()) walk(absolutePath, relativePath);
      else if (stat.isFile())
        found.set(relativePath, digest(absolutePath, isExecutable(stat.mode)));
    }
  };
  walk(dir, "");
  return found;
}
