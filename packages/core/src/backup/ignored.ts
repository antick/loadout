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

/** Left-out entries inside one skill folder, relative to it. A left-out folder counts once. */
async function listIgnored(env: BackupEnv, folder: string): Promise<string[]> {
  const prefix = `${folder}/`;
  const result = await env.git.probe(
    ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory", "--", prefix],
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
 * left-out files. Null when there is no such folder.
 */
export async function setAsideFolder(
  env: BackupEnv,
  stage: Stage,
  folder: string,
  key: string,
): Promise<SetAsideFolder | null> {
  const from = join(env.repoDir, folder);
  if (!lstatOrNull(from)) return null;
  const ignored = await listIgnored(env, folder);
  const to = stage.pathOf(join(ASIDE_DIR, key));
  ensureDir(dirname(to));
  renameSync(from, to);
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

/**
 * True when `commit` has something where one of our folders keeps a left-out entry. A
 * fast-forward would let git overwrite that entry, so the full merge must run instead.
 * `folders`: our folder → the same skill's folder in `commit`.
 */
export async function ignoredInTheWay(
  env: BackupEnv,
  folders: ReadonlyMap<string, string>,
  commit: string,
): Promise<boolean> {
  for (const [ours, theirs] of folders) {
    const ignored = await listIgnored(env, ours);
    if (ignored.length === 0) continue;
    const result = await env.git.probe(
      ["ls-tree", "-r", "-z", "--name-only", commit, "--", `${theirs}/`],
      { globalArgs: ["--literal-pathspecs"] },
    );
    // Unknown counts as in the way: the full merge is always safe, only slower.
    if (result.code !== 0) return true;
    const prefix = `${theirs}/`;
    const incoming = result.stdout.split("\0").map((path) => path.slice(prefix.length));
    const hit = ignored.some((entry) =>
      incoming.some((path) => path === entry || path.startsWith(`${entry}/`)),
    );
    if (hit) return true;
  }
  return false;
}
