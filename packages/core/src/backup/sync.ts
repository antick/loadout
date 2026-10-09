import {
  DEFAULT_BACKUP_COMMIT_MESSAGE,
  type MergeSummary,
  type SyncOutcome,
  type SyncOptions,
  type SyncReviewAnswer,
} from "@loadout/shared";
import { isAppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { type BackupEnv, REMOTE_NAME } from "./env";
import { whileMerging } from "./interrupted";
import { mergeRemote } from "./merge";
import { reportStage, withStages } from "./progress";
import {
  aheadBehind,
  assertRepo,
  commitStaged,
  originUrl,
  prepareCommit,
  requireBranch,
} from "./repo";
import { scanForPush, scanUncommittedChanges, secretsFound } from "./secrets";
import { restorePointId } from "./snapshots";

/**
 * "Back up now": commit → fetch → merge → push, retried when another device pushed in between.
 * Each commit on the branch is a restore point of its own (see `snapshots.ts`). Disk work happens
 * inside the library lock; the network calls never do.
 */

const MAX_PUSH_ATTEMPTS = 3;

/** Several merges in one sync (a retried push) read as one to the user. */
function combine(earlier: MergeSummary | null, later: MergeSummary): MergeSummary {
  if (!earlier || earlier.upToDate) return later;
  if (later.upToDate) return earlier;
  return {
    upToDate: false,
    updated: [...earlier.updated, ...later.updated],
    keptLocal: [...new Set([...earlier.keptLocal, ...later.keptLocal])],
    removed: [...earlier.removed, ...later.removed],
    newConflicts: [...new Set([...earlier.newConflicts, ...later.newConflicts])],
  };
}

/** Download the remote's state. The only thing it changes locally are remote-tracking refs. */
export async function fetchRemote(env: BackupEnv): Promise<void> {
  assertRepo(env);
  if (await originUrl(env)) await fetchOrigin(env);
}

/** `fetchRemote` for a caller that already knows there is a remote. */
function fetchOrigin(env: BackupEnv): Promise<void> {
  return env.git.run(["fetch", "--prune", REMOTE_NAME], { network: true }).then(() => undefined);
}

/** Fetch, then merge what arrived. */
export async function pullRemote(env: BackupEnv): Promise<MergeSummary> {
  await fetchRemote(env);
  const result = await env.ctx.lock.run("backup merge", async () => {
    // The merge commits pending changes first: bring the metadata and the ignore file up to date
    // now, so the check below sees exactly what that commit takes in.
    await prepareCommit(env);
    // As before a sync's commit: a key caught now can still simply be removed.
    const uncommitted = await scanUncommittedChanges(env);
    if (uncommitted.length > 0) throw secretsFound(uncommitted);
    return whileMerging(env, () => mergeRemote(env));
  });
  return result.summary;
}

export function syncLibrary(
  env: BackupEnv,
  message: string = DEFAULT_BACKUP_COMMIT_MESSAGE,
  review?: SyncReviewAnswer,
  options: SyncOptions = {},
): Promise<SyncOutcome> {
  return withStages(env, () => runSync(env, message, review, options));
}

async function runSync(
  env: BackupEnv,
  message: string,
  review: SyncReviewAnswer | undefined,
  options: SyncOptions,
): Promise<SyncOutcome> {
  assertRepo(env);
  const { lock, settings } = env.ctx;
  const text = message.trim() || DEFAULT_BACKUP_COMMIT_MESSAGE;

  reportStage(env, "preparing");
  // Asked once: every git call costs a process, and a sync makes dozens.
  const hasRemote = (await originUrl(env)) !== null;
  let committed = await lock.run("backup commit", async () => {
    // The ignore list is refreshed here: a skill back under the size limit stops being ignored
    // now, and must be checked before the commit takes it in.
    await prepareCommit(env);
    // A key caught before it is committed can still simply be removed; once committed, it would
    // travel with the history even after removal. Without a remote nothing leaves the computer.
    if (hasRemote && !options.allowSecrets) {
      const uncommitted = await scanUncommittedChanges(env);
      if (uncommitted.length > 0) throw secretsFound(uncommitted);
    }
    reportStage(env, "saving");
    return commitStaged(env, text);
  });
  let merge: MergeSummary | null = null;
  let changed = committed;
  let pushed = false;

  if (hasRemote) {
    const branch = await requireBranch(env);
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
      reportStage(env, "downloading");
      await fetchOrigin(env);
      reportStage(env, "merging");
      const result = await lock.run("backup merge", () =>
        whileMerging(env, () => mergeRemote(env, review)),
      );
      merge = combine(merge, result.summary);
      committed ||= result.committed;
      changed ||= result.committed || result.changed;

      const { ahead } = await aheadBehind(env, branch);
      if (result.upstream && ahead === 0) break;

      // Everything this push sends, commits made while there was no remote included.
      const secrets = options.allowSecrets ? [] : await scanForPush(env, branch);
      if (secrets.length > 0) throw secretsFound(secrets);

      reportStage(env, "uploading");
      try {
        await env.git.run(["push", "-u", REMOTE_NAME, branch], { network: true });
        pushed = true;
        break;
      } catch (error) {
        // Someone else pushed between our fetch and our push: merge their work and try again.
        if (!isAppError(error, "GIT_REJECTED") || attempt === MAX_PUSH_ATTEMPTS) throw error;
      }
    }
  }

  // The restore point this sync made or sent; none when nothing changed.
  const snapshot = changed || pushed ? await restorePointId(env, "HEAD") : null;
  if (pushed) settings.deleteRaw(INTERNAL_KEYS.backupLastAutoError);
  // The "restored from" note describes the state until it is backed up again.
  settings.deleteRaw(INTERNAL_KEYS.backupRestoredFrom);
  // A sync that changed and sent nothing is not worth a line in the activity log.
  if (changed || pushed) {
    const merged = merge && !merge.upToDate ? `, merged ${merge.updated.length} updated` : "";
    env.ctx.activity.record(
      "backup",
      env.deviceName(),
      `${pushed ? "Pushed" : "Saved locally"}${merged}`,
    );
  }
  env.ctx.touched("backup");
  return { committed, merge: merge && !merge.upToDate ? merge : null, pushed, snapshot };
}
