import type { Snapshot } from "@loadout/shared";
import { invalid, notFound } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { assertReadable, schemaAt } from "./compat";
import type { BackupEnv } from "./env";
import { commitLibrary, commitStaged, resolveCommit } from "./repo";

/**
 * Restore points are the branch's own commits, read with `git log --first-parent`: every backup,
 * merge, restore and conflict choice is one, with the device that made it (the commit author) and
 * its date. Nothing else is created or pushed for them. Tags older versions made stay where they
 * are, on this computer and on the remote; nothing here ever deletes one.
 */

export const DEFAULT_SNAPSHOT_LIMIT = 50;
/** Fixed, so the same commit is always named the same way; git lengthens it only to stay unique. */
const ID_LENGTH = 12;
const MS_PER_SECOND = 1000;
const FIELD_SEPARATOR = "\0";
const RECORD_SEPARATOR = "\u0001";
const LOG_FORMAT = ["%h", "%ct", "%an", "%s"].join("%x00");
/** A commit id, whole or shortened as git prints it. Never a ref name or an option. */
const COMMIT_ID = /^[0-9a-f]{7,64}$/i;
const BEFORE_RESTORE_MESSAGE = "backup: before restore";
const RESTORE_MESSAGE_PREFIX = "restore: ";

/** The id of a commit as restore points name it; null when there is no such commit. */
export async function restorePointId(env: BackupEnv, revision: string): Promise<string | null> {
  const result = await env.git.probe([
    "rev-parse",
    "-q",
    "--verify",
    `--short=${ID_LENGTH}`,
    `${revision}^{commit}`,
  ]);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

/** Restore points as `git log` with `args` lists them; empty when it fails. */
async function readSnapshots(env: BackupEnv, args: string[]): Promise<Snapshot[]> {
  const result = await env.git.probe([
    "log",
    `--abbrev=${ID_LENGTH}`,
    `--format=${LOG_FORMAT}%x01`,
    ...args,
  ]);
  if (result.code !== 0) return [];
  const snapshots: Snapshot[] = [];
  for (const record of result.stdout.split(RECORD_SEPARATOR)) {
    const [id, committed, author, subject] = record.replace(/^\s+/, "").split(FIELD_SEPARATOR);
    if (!id) continue;
    snapshots.push({
      id,
      message: subject ?? "",
      createdAt: Number(committed ?? 0) * MS_PER_SECOND,
      device: author ?? "",
    });
  }
  return snapshots;
}

/** The newest restore points of the current branch, newest first. Empty before the first commit. */
export function listSnapshots(env: BackupEnv, limit = DEFAULT_SNAPSHOT_LIMIT): Promise<Snapshot[]> {
  return readSnapshots(env, ["--first-parent", `--max-count=${Math.max(1, limit)}`, "HEAD"]);
}

/** True when `commit` is in the current branch's history. */
async function inHistory(env: BackupEnv, commit: string): Promise<boolean> {
  const result = await env.git.probe(["merge-base", "--is-ancestor", commit, "HEAD"]);
  return result.code === 0;
}

/** The commit restore point `id` names; refused when a restore to it is not possible. */
async function findRestorePoint(env: BackupEnv, id: string): Promise<string> {
  if (!COMMIT_ID.test(id)) throw invalid(`"${id}" is not a backup version.`);
  const commit = await resolveCommit(env, id);
  if (!commit || !(await inHistory(env, commit))) throw notFound(`Backup version not found: ${id}`);
  assertReadable(await schemaAt(env, commit));
  return commit;
}

/** Restore point `id`, checked exactly as `restoreSnapshot` checks it, without restoring. */
export async function describeRestorePoint(env: BackupEnv, id: string): Promise<Snapshot> {
  const commit = await findRestorePoint(env, id);
  const [snapshot] = await readSnapshots(env, ["--max-count=1", commit]);
  if (!snapshot) throw notFound(`Backup version not found: ${id}`);
  return snapshot;
}

/**
 * Put the library back to how it was at restore point `id`. History is never rewritten: the
 * current state is committed first (the returned safety point), then a new commit carries the old
 * content forward. Must run inside the library lock.
 */
export async function restoreSnapshot(env: BackupEnv, id: string): Promise<string> {
  const commit = await findRestorePoint(env, id);

  await commitLibrary(env, BEFORE_RESTORE_MESSAGE);
  const safety = await safetyPoint(env);
  const restored = (await restorePointId(env, commit)) ?? id;
  try {
    // Makes the index and the folder match the restore point exactly, deletions included,
    // without moving the branch.
    await env.git.run(["read-tree", "--reset", "-u", commit]);
    await commitStaged(env, `${RESTORE_MESSAGE_PREFIX}${restored}`);
  } catch (error) {
    await env.git.probe(["reset", "--hard", safety]);
    throw error;
  }
  env.ctx.settings.setRaw(INTERNAL_KEYS.backupRestoredFrom, restored);
  return safety;
}

/** The restore point a risky change can go back to: the commit the library is at now. */
export async function safetyPoint(env: BackupEnv): Promise<string> {
  const id = await restorePointId(env, "HEAD");
  if (!id) throw notFound("The library has no backup to go back to yet.");
  return id;
}
