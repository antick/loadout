import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLISH_MAX_FILE_BYTES, type SecretFinding } from "@loadout/shared";
import { findSecretsInFile, secretsHeldBack } from "../backup/secret-scan";
import type { AppError } from "../errors";
import { lstatOrNull, readDirSafe } from "../util/fs";
import { isIgnoredContentName } from "../util/hash";
import { isLeftOut } from "../util/left-out";

/**
 * The files of a skill folder that go into a published copy. What never leaves this computer
 * (`util/left-out.ts`: dependencies, local secrets, logs) and links stay behind: a repository
 * other people read is not the place for them.
 */

const EXECUTABLE_BITS = 0o111;

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
        if (isLeftOut(entry.name, true)) leftOut.push(`${relativePath}/`);
        else walk(absolutePath, relativePath);
      } else if (stat.isFile()) {
        if (isLeftOut(entry.name, false)) {
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

/** What looks like a key or token in the files, each named `<prefix>/<path>` (or its path). */
export function findSecretsIn(files: readonly PublishFile[], prefix = ""): SecretFinding[] {
  const found: SecretFinding[] = [];
  for (const file of files) {
    const name = prefix ? `${prefix}/${file.relativePath}` : file.relativePath;
    // Every text file, whatever its size; a binary one is not text and holds no key to read.
    found.push(...(findSecretsInFile(name, file.absolutePath) ?? []));
  }
  return found;
}

/** The error a publish stops with when files look like they hold keys; lists every finding. */
export function publishSecretsHeldBack(findings: SecretFinding[]): AppError {
  return secretsHeldBack(
    "Publishing",
    findings,
    "Remove it from the skill, or publish anyway if it is safe to share.",
  );
}
