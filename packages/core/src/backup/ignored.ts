import { existsSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { AppError } from "../errors";
import { LIBRARY_PLACE } from "../storage/removed-library";
import { ensureDir, lstatOrNull } from "../util/fs";
import type { BackupEnv } from "./env";
import type { Stage } from "./extract";

/**
 * Files left out of the backup (`node_modules/`, `.env`, the user's own patterns) exist only on
 * this device. When a merge or a conflict choice replaces a skill folder with another device's
 * version, they would go with the old folder. So the old folder is set aside instead of deleted,
 * and once the new one is committed its left-out files move across. One that cannot (the new
 * version has a file at its path) stays with the old folder, which goes to Recently removed.
 */

const ASIDE_DIR = ".replaced";
const KEPT_DETAIL = "Local files kept in Recently removed";
const NOT_KEPT_DETAIL = "Local files could not be kept; they are in";

export interface SetAsideFolder {
  /** Where the folder lived in the library. */
  from: string;
  /** Where it is now, inside the stage. */
  to: string;
  /** Left-out files and folders inside it, relative to it. */
  ignored: string[];
}

/**
 * Left-out entries inside one skill folder, relative to it; in the whole library without one.
 * A left-out folder counts once.
 */
async function listIgnored(env: BackupEnv, folder?: string): Promise<string[]> {
  const prefix = folder ? `${folder}/` : "";
  const result = await env.git.probe(
    [
      "ls-files",
      "-z",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      ...(prefix ? ["--", prefix] : []),
    ],
    { globalArgs: ["--literal-pathspecs"] },
  );
  if (result.code !== 0) return [];
  return result.stdout
    .split("\0")
    .map((path) => path.replace(/\/$/, ""))
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter(Boolean);
}

/**
 * Move the skill folder `folder` (relative to the library) into the stage and remember its
 * left-out files. Null when there is no such folder. `move` does the move (a merge journals it).
 */
export async function setAsideFolder(
  env: BackupEnv,
  stage: Stage,
  folder: string,
  key: string,
  move: (from: string, to: string) => void = renameSync,
): Promise<SetAsideFolder | null> {
  const from = join(env.repoDir, folder);
  if (!lstatOrNull(from)) return null;
  const ignored = await listIgnored(env, folder);
  const to = stage.pathOf(join(ASIDE_DIR, key));
  ensureDir(dirname(to));
  move(from, to);
  return { from, to, ignored };
}

/** Undo `setAsideFolder` after a failure, when nothing took the folder's place meanwhile. */
export function putBackFolder(aside: SetAsideFolder): void {
  if (existsSync(aside.to) && !lstatOrNull(aside.from)) renameSync(aside.to, aside.from);
}

/**
 * Move the left-out files of a set-aside folder into the folder that replaced it. Returns the
 * paths that are still in the set-aside folder: the new folder has something at the same path
 * (another device tracks a file there), or the move failed.
 */
function carryIgnored(aside: SetAsideFolder, target: string): string[] {
  const left: string[] = [];
  for (const relative of aside.ignored) {
    const from = join(aside.to, relative);
    const to = join(target, relative);
    if (!lstatOrNull(from)) continue;
    if (!existsSync(target) || lstatOrNull(to)) {
      left.push(relative);
      continue;
    }
    try {
      ensureDir(dirname(to));
      renameSync(from, to);
    } catch {
      left.push(relative);
    }
  }
  return left;
}

/**
 * Once the folder that replaced `aside` is committed: move the left-out files across, and keep
 * the set-aside folder in Recently removed when some could not move, since they exist nowhere
 * else. Returns false when even that failed: the caller must then leave the stage on disk.
 */
export function settleSetAside(env: BackupEnv, aside: SetAsideFolder, target: string): boolean {
  const left = carryIgnored(aside, target);
  if (left.length === 0) return true;
  const name = basename(aside.from);
  try {
    const kept = env.removed.setAside(aside.to, {
      place: LIBRARY_PLACE,
      reason: "replaced",
      originalPath: aside.from,
    });
    if (kept === null) throw new Error("nothing to keep");
    env.ctx.log.warn(`Kept local files of ${aside.from} in Recently removed`, left);
    env.ctx.activity.record("backup", name, KEPT_DETAIL);
    return true;
  } catch (error) {
    env.ctx.log.error(`Could not keep local files of ${aside.from}; left in ${aside.to}`, error);
    env.ctx.activity.record("backup", name, `${NOT_KEPT_DETAIL} ${aside.to}`, false);
    return false;
  }
}

/**
 * The error a merge or conflict choice ends with, once it is otherwise done, when left-out files
 * could be kept neither in the skill nor in Recently removed: they wait in `dir` for the user.
 */
export function localFilesNotKept(dir: string): AppError {
  return new AppError(
    "IO",
    `Some files kept out of the backup could not be put back in their skill or in Recently removed. They are in ${dir}; move them somewhere safe. Everything else was done.`,
    { path: dir },
  );
}

/** `path` and every folder above it: `a/b/c` → `a/b/c`, `a/b`, `a`. */
function selfAndParents(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, parts.length - index).join("/"));
}

/**
 * Left-out entries of the library (relative to it) that `commit` has a file at, inside or above.
 * A line merge of `commit` would overwrite or delete them without asking: git's merge strategy
 * does not honour `--no-overwrite-ignore`, only a fast-forward does.
 */
export async function leftOutInTheWay(env: BackupEnv, commit: string): Promise<string[]> {
  const ignored = await listIgnored(env);
  if (ignored.length === 0) return [];
  const listing = await env.git.run(["ls-tree", "-r", "-z", "--name-only", commit]);
  const files = new Set<string>();
  const folders = new Set<string>();
  for (const path of listing.stdout.split("\0").filter(Boolean)) {
    files.add(path);
    for (const parent of selfAndParents(path).slice(1)) folders.add(parent);
  }
  // Inside a left-out folder, only what is here at an incoming file's path, or a file where it
  // needs a folder, would be lost.
  const blocks = (entry: string, file: string): boolean =>
    selfAndParents(file).some((path) => {
      if (!path.startsWith(`${entry}/`)) return false;
      const stat = lstatOrNull(join(env.repoDir, path));
      return stat !== null && (path === file || !stat.isDirectory());
    });
  return ignored.filter(
    (entry) =>
      selfAndParents(entry).some((path) => files.has(path)) ||
      (folders.has(entry) && [...files].some((file) => blocks(entry, file))),
  );
}

/**
 * Before a restore puts `commit`'s files in place, which overwrites whatever is at their paths:
 * each skill folder holding a left-out entry the commit has a file at is copied to Recently
 * removed first, so the local version waits there, as a sync keeps it. A left-out file at the top
 * of the library has no folder to go with, so the restore is refused instead.
 */
export async function keepLeftOutBeforeRestore(env: BackupEnv, commit: string): Promise<void> {
  const inTheWay = await leftOutInTheWay(env, commit);
  if (inTheWay.length === 0) return;
  const folders = [...new Set(inTheWay.map((entry) => entry.split("/")[0] ?? entry))];
  const loose = folders.filter((folder) => !lstatOrNull(join(env.repoDir, folder))?.isDirectory());
  if (loose.length > 0) {
    throw new AppError(
      "GIT",
      `This backup version has files where this library keeps files left out of the backup, and restoring it would overwrite them: ${loose.join(", ")}. Move them out of the library folder, restore again, then put back what you still need.`,
      { paths: loose },
    );
  }
  for (const folder of folders) {
    const path = join(env.repoDir, folder);
    env.removed.keepCopy(path, { place: LIBRARY_PLACE, reason: "replaced" });
    env.ctx.log.warn(`Kept local files of ${path} in Recently removed before a restore`, inTheWay);
    env.ctx.activity.record("backup", folder, KEPT_DETAIL);
  }
}
