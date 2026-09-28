import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir, lstatOrNull } from "../util/fs";
import type { BackupEnv } from "./env";
import type { Stage } from "./extract";

/**
 * Files left out of the backup (`node_modules/`, `.env`, the user's own patterns) exist only on
 * this device. When a merge or a conflict choice replaces a skill folder with another device's
 * version, they would go with the old folder. So the old folder is set aside instead of deleted,
 * and once the new one is committed its left-out files move across.
 */

const ASIDE_DIR = ".replaced";

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
 * Move the left-out files of a set-aside folder into the folder that replaced it, where that
 * folder has nothing at the same path. Returns the paths that could not be moved.
 */
export function carryIgnored(aside: SetAsideFolder, target: string): string[] {
  const failed: string[] = [];
  if (!existsSync(target)) return aside.ignored;
  for (const relative of aside.ignored) {
    const from = join(aside.to, relative);
    const to = join(target, relative);
    if (!lstatOrNull(from) || lstatOrNull(to)) continue;
    try {
      ensureDir(dirname(to));
      renameSync(from, to);
    } catch {
      failed.push(relative);
    }
  }
  return failed;
}
