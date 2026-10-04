import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AppError } from "../errors";
import { processAlive } from "../lock";
import { statOrNull } from "../util/fs";
import type { BackupEnv } from "./env";

const GIT_DIR = ".git";
/** Files git leaves behind while an operation is unfinished. */
const INTERRUPTED_MARKERS = ["MERGE_HEAD", "index.lock", "rebase-merge", "rebase-apply"] as const;
/**
 * Written into `.git` while Loadout merges, holding its process id. A leftover merge next to a
 * note from a process that is gone was Loadout's own, cut off by a crash or a power cut, and is
 * safe to abort. Without the note it may be someone's work in a terminal: never touched.
 */
const OWN_MERGE_NOTE = "loadout-merging";
const INDEX_LOCK = "index.lock";
/**
 * A git command running right now (an editor's git view, a terminal) holds `index.lock` for a
 * moment. A lock younger than this is waited for; an older one was left behind.
 */
const INDEX_LOCK_GRACE_MS = 5000;
const INDEX_LOCK_POLL_MS = 100;

const gitPath = (env: BackupEnv, name: string): string => join(env.repoDir, GIT_DIR, name);

function leftoverMarker(env: BackupEnv): string | undefined {
  return INTERRUPTED_MARKERS.find((name) => existsSync(gitPath(env, name)));
}

/** Wait while `index.lock` is fresh: another git command is still running, not cut off. */
async function waitForBusyIndex(env: BackupEnv): Promise<void> {
  for (;;) {
    const lock = statOrNull(gitPath(env, INDEX_LOCK));
    if (!lock || Date.now() - lock.mtimeMs >= INDEX_LOCK_GRACE_MS) return;
    await sleep(INDEX_LOCK_POLL_MS);
  }
}

/** The note of a Loadout merge whose process is gone; false for anything else. */
function abandonedOwnMerge(env: BackupEnv): boolean {
  try {
    const pid = Number(readFileSync(gitPath(env, OWN_MERGE_NOTE), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 && !processAlive(pid);
  } catch {
    return false;
  }
}

/** Undo what an unfinished merge left: the merge itself, and a lock its git process held. */
async function abortOwnMerge(env: BackupEnv): Promise<void> {
  rmSync(gitPath(env, INDEX_LOCK), { force: true });
  if (existsSync(gitPath(env, "MERGE_HEAD"))) await env.git.probe(["merge", "--abort"]);
  rmSync(gitPath(env, OWN_MERGE_NOTE), { force: true });
}

/**
 * A merge or rebase that never finished must be dealt with before more work is stacked on it.
 * Loadout's own merge, cut off by a crash, is aborted here and the work goes on; anything else
 * stops with an error that says what to do.
 */
export async function recoverInterrupted(env: BackupEnv): Promise<void> {
  await waitForBusyIndex(env);
  const marker = leftoverMarker(env);
  if (!marker) return;
  if (abandonedOwnMerge(env)) {
    env.ctx.log.warn(`Aborting a backup merge that did not finish (${marker} was left behind)`);
    await abortOwnMerge(env);
    if (!leftoverMarker(env)) return;
  }
  throw new AppError(
    "GIT",
    "An earlier Git operation in the library folder did not finish. Finish or abort it in a terminal, or restore the library from the backup remote, then try again.",
    { marker: leftoverMarker(env) ?? marker },
  );
}

/**
 * Run a merge with the note in place. A merge that fails in this process is aborted at once;
 * only a crash leaves the note for `recoverInterrupted` to find.
 */
export async function whileMerging<T>(env: BackupEnv, merge: () => Promise<T>): Promise<T> {
  // First: a note left by a crashed run must be read before this run writes its own.
  await recoverInterrupted(env);
  writeFileSync(gitPath(env, OWN_MERGE_NOTE), String(process.pid));
  try {
    return await merge();
  } catch (error) {
    if (existsSync(gitPath(env, "MERGE_HEAD"))) await env.git.probe(["merge", "--abort"]);
    throw error;
  } finally {
    rmSync(gitPath(env, OWN_MERGE_NOTE), { force: true });
  }
}
