import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { invalid } from "../errors";
import { isInside, toPosix } from "../util/fs";

function unsupported(path: string, reason: string): never {
  throw invalid(
    `“${path}” ${reason} Nothing has been changed. Review this item in your project, then compare again.`,
  );
}

/** Refuse redirected parents: every write must stay in this project's actual folders. */
export function checkDuplicatePath(projectPath: string, path: string): void {
  const root = realpathSync(projectPath);
  const parent = dirname(path);
  if (
    !isInside(root, realpathSync(parent)) ||
    realpathSync(parent) !== join(root, relative(projectPath, parent))
  ) {
    throw invalid(
      `“${path}” is outside the project or has a linked parent folder. Move it into a regular project folder before resolving duplicates. Nothing has been changed.`,
    );
  }
}

/** Strict comparison: includes hidden files, empty directories and executable permissions. */
export function duplicateSnapshot(root: string) {
  const files: { path: string; hash: string }[] = [];
  const identities: string[] = [];
  const walk = (path: string): void => {
    const stat = lstatSync(path);
    const name = toPosix(relative(root, path));
    if (stat.isSymbolicLink()) {
      unsupported(
        path,
        "is a link inside a skill. Loadout cannot safely compare or replace a folder containing linked files or subfolders.",
      );
    }
    if (!stat.isDirectory() && !stat.isFile()) {
      unsupported(
        path,
        "is a special filesystem item, rather than a regular file or folder. Loadout cannot safely back it up.",
      );
    }
    identities.push(JSON.stringify([name, stat.dev, stat.ino, stat.mtimeMs, stat.ctimeMs]));
    if (stat.isDirectory()) {
      files.push({ path: `${name}/`, hash: `directory:${stat.mode & 0o777}` });
      for (const entry of readdirSync(path).sort()) {
        if (entry === ".git")
          unsupported(
            join(path, entry),
            "belongs to a nested Git repository. Replacing this skill could affect its separate version history.",
          );
        walk(join(path, entry));
      }
    } else {
      const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
      files.push({ path: name, hash: `${stat.mode & 0o777}:${hash}` });
    }
  };
  walk(root);
  return {
    files,
    hash: digest(files),
    identity: digest(identities),
  };
}

export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
