import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { SECOND_MS, isRecord } from "@loadout/shared";
import { AppError } from "../errors";
import { writerGone } from "../lock";
import { LIBRARY_PLACE } from "@loadout/shared";
import {
  GIT_DIR,
  ensureDir,
  isInside,
  lstatOrNull,
  readDirSafe,
  removePath,
  statOrNull,
} from "../util/fs";
import type { BackupEnv } from "./env";
import { PREVIEW_INDEX_PREFIX } from "./extract";
import { sweepLeftovers } from "./leftovers";

/** Files git leaves behind while an operation is unfinished. */
const INTERRUPTED_MARKERS = ["MERGE_HEAD", "index.lock", "rebase-merge", "rebase-apply"] as const;
/**
 * Written into `.git` while Loadout merges: its process id on the first line, then the merge's
 * journal, one JSON entry per line. A leftover note from a process that is gone (or written
 * before this computer started, when its pid may belong to another program now) was Loadout's
 * own merge, cut off by a crash or a power cut, and is safe to undo. Without the note a leftover
 * merge may be someone's work in a terminal: never touched.
 */
const OWN_MERGE_NOTE = "loadout-merging";
const INDEX_LOCK = "index.lock";
/**
 * A git command running right now (an editor's git view, a terminal) holds `index.lock` for a
 * moment. A lock younger than this is waited for; an older one was left behind.
 */
const INDEX_LOCK_GRACE_MS = 5 * SECOND_MS;
const INDEX_LOCK_POLL_MS = 100;

/**
 * What the skill-aware merge does to the library before it commits, so a crash can be undone:
 * the commit it starts from and its scratch folder, then every folder it moves, each written
 * down before the move.
 */
type JournalEntry = { head: string; stage: string } | { from: string; to: string };

interface Journal {
  head: string | null;
  stages: string[];
  moves: { from: string; to: string }[];
}

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

function parseEntry(line: string): Record<string, unknown> | null {
  try {
    const entry: unknown = JSON.parse(line);
    return isRecord(entry) ? entry : null;
  } catch {
    // A line cut off by the crash: the move it announced never started.
    return null;
  }
}

/** The journal of a Loadout merge whose process is gone; null for anything else. */
function abandonedOwnMerge(env: BackupEnv): Journal | null {
  let lines: string[];
  const note = gitPath(env, OWN_MERGE_NOTE);
  try {
    lines = readFileSync(note, "utf8").split(/\r?\n/);
  } catch {
    return null;
  }
  const pid = Number(lines[0]?.trim());
  const writtenAt = statOrNull(note)?.mtimeMs ?? Date.now();
  if (!Number.isInteger(pid) || pid <= 0 || !writerGone(pid, writtenAt)) return null;
  const journal: Journal = { head: null, stages: [], moves: [] };
  for (const entry of lines.slice(1).map(parseEntry)) {
    if (typeof entry?.head === "string" && typeof entry.stage === "string") {
      journal.head ??= entry.head;
      journal.stages.push(entry.stage);
    } else if (typeof entry?.from === "string" && typeof entry.to === "string") {
      journal.moves.push({ from: entry.from, to: entry.to });
    }
  }
  return journal;
}

function noteInJournal(env: BackupEnv, entry: JournalEntry): void {
  appendFileSync(gitPath(env, OWN_MERGE_NOTE), `${JSON.stringify(entry)}\n`);
}

/**
 * Put moved folders back where they were, newest first, skipping any whose old place is taken.
 * False when one could not go back: it is still where it was moved to.
 */
function undoMoves(moves: readonly { from: string; to: string }[]): boolean {
  let all = true;
  for (const { from, to } of moves.toReversed()) {
    if (!lstatOrNull(to)) continue;
    if (lstatOrNull(from)) {
      all = false;
      continue;
    }
    try {
      ensureDir(dirname(from));
      renameSync(to, from);
    } catch {
      all = false;
    }
  }
  return all;
}

/**
 * Folder moves in and out of the library before a merge or a conflict choice commits. Each is
 * written into the journal before it happens, so a crash is undone by `recoverInterrupted`, and
 * kept here, so a failure in this process is undone the same way. Use inside `whileMerging`.
 */
export interface LibraryEdit {
  /** A scratch folder the edit moves things through, cleaned up after a crash. */
  addStage(dir: string): void;
  /** Move a folder in or out of the library, written down first. */
  move(from: string, to: string): void;
  /** Put every moved folder back, newest first. False when one could not go back. */
  undo(): boolean;
}

/** Start an edit of the library that commits on top of `head`. */
export function startLibraryEdit(env: BackupEnv, head: string): LibraryEdit {
  const moves: { from: string; to: string }[] = [];
  return {
    addStage: (stage) => noteInJournal(env, { head, stage }),
    move: (from, to) => {
      noteInJournal(env, { from, to });
      renameSync(from, to);
      moves.push({ from, to });
    },
    undo: () => undoMoves(moves),
  };
}

/**
 * Folders of ours that a merge moved into `stage` and that could not go back: kept in Recently
 * removed. False when one could be kept nowhere, so the scratch folder must stay on disk.
 */
function keepStranded(env: BackupEnv, journal: Journal, stage: string): boolean {
  let kept = true;
  for (const { from, to } of journal.moves) {
    if (!isInside(stage, to) || !lstatOrNull(to)) continue;
    try {
      env.removed.setAside(to, { place: LIBRARY_PLACE, reason: "replaced", originalPath: from });
    } catch (error) {
      env.ctx.log.error(`Could not keep ${from} in Recently removed; left in ${to}`, error);
      kept = false;
    }
  }
  return kept;
}

/** The full id of `revision`, which may be shortened; the revision itself when git cannot tell. */
async function fullCommitId(env: BackupEnv, revision: string): Promise<string> {
  const result = await env.git.probe(["rev-parse", "-q", "--verify", `${revision}^{commit}`]);
  return (result.code === 0 && result.stdout.trim()) || revision;
}

/**
 * Undo what an unfinished merge left. Before its commit: every folder goes back where it was, in
 * reverse order, then git puts every tracked file back as the starting commit has it. The merge
 * started from a clean folder (`mergeRemote` commits first), so that resets nothing of the user's.
 * After its commit only the scratch folder is left over: what of ours is still in it is kept.
 */
async function undoOwnMerge(env: BackupEnv, journal: Journal): Promise<void> {
  rmSync(gitPath(env, INDEX_LOCK), { force: true });
  const head = await fullCommitId(env, "HEAD");
  // A conflict choice journals its safety point shortened: compare full ids, never the text.
  const start = journal.head === null ? null : await fullCommitId(env, journal.head);
  const committed = start !== null && start !== head;
  if (!committed && journal.head) {
    undoMoves(journal.moves);
    // Not `merge --abort`: it keeps what the merge changed on disk, such as a folder moved away.
    await env.git.run(["reset", "--hard", journal.head]);
  } else if (!committed && existsSync(gitPath(env, "MERGE_HEAD"))) {
    // A line merge (or a note from before the journal): git's own merge state is all there is.
    await env.git.probe(["merge", "--abort"]);
  }
  for (const stage of journal.stages) {
    if (keepStranded(env, journal, stage)) await removePath(stage);
  }
  rmSync(gitPath(env, OWN_MERGE_NOTE), { force: true });
}

/** Index files the sync review writes next to the library; one a crash left is never used again. */
async function removeLeftoverPreviewIndexes(env: BackupEnv): Promise<void> {
  for (const entry of readDirSafe(env.siblingDir)) {
    if (!entry.name.startsWith(PREVIEW_INDEX_PREFIX)) continue;
    await removePath(join(env.siblingDir, entry.name));
  }
}

/**
 * A merge or rebase that never finished must be dealt with before more work is stacked on it.
 * Loadout's own merge, cut off by a crash, is undone here and the work goes on; anything else
 * stops with an error that says what to do. Must run inside the library lock.
 */
export async function recoverInterrupted(env: BackupEnv): Promise<void> {
  await waitForBusyIndex(env);
  await removeLeftoverPreviewIndexes(env);
  const journal = abandonedOwnMerge(env);
  if (journal) {
    env.ctx.log.warn("Undoing a backup merge that did not finish", leftoverMarker(env));
    await undoOwnMerge(env, journal);
  }
  await sweepLeftovers(env);
  const marker = leftoverMarker(env);
  if (!marker) return;
  throw new AppError(
    "GIT",
    "An earlier Git operation in the library folder did not finish. Finish or abort it in a terminal, or restore the library from the backup remote, then try again.",
    { marker },
  );
}

/**
 * Run a merge with the note in place. A merge that fails in this process is aborted at once;
 * only a crash leaves the note for `recoverInterrupted` to find.
 */
export async function whileMerging<T>(env: BackupEnv, merge: () => Promise<T>): Promise<T> {
  // First: a note left by a crashed run must be read before this run writes its own.
  await recoverInterrupted(env);
  writeFileSync(gitPath(env, OWN_MERGE_NOTE), `${process.pid}\n`);
  try {
    return await merge();
  } catch (error) {
    if (existsSync(gitPath(env, "MERGE_HEAD"))) await env.git.probe(["merge", "--abort"]);
    throw error;
  } finally {
    rmSync(gitPath(env, OWN_MERGE_NOTE), { force: true });
  }
}
