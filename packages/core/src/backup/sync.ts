import {
  DEFAULT_BACKUP_COMMIT_MESSAGE,
  type MergeSummary,
  type SyncOutcome,
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
  commitLibrary,
  originUrl,
  requireBranch,
  resolveCommit,
  upstreamRef,
} from "./repo";
import { scanForPush, scanUncommittedChanges, secretsFound } from "./secrets";
import { refreshIgnoreFile } from "./size";
import { snapshotAtHead, tagSnapshot } from "./snapshots";

/**
 * "Back up now": commit → fetch → merge → snapshot → push, retried when another device pushed in
 * between. Disk work happens inside the library lock; the network calls never do.
 */

const MAX_PUSH_ATTEMPTS = 3;

/** Several merges in one sync (a retried push) read as one to the user. */
function combine(earlier: MergeSummary | null, later: MergeSummary): MergeSummary {
  if (!earlier || earlier.upToDate) return later;
  if (later.upToDate) return { ...earlier, pendingTotal: later.pendingTotal };
  return {
    upToDate: false,
    fastForward: earlier.fastForward && later.fastForward,
    updated: [...earlier.updated, ...later.updated],
    keptLocal: [...new Set([...earlier.keptLocal, ...later.keptLocal])],
    removed: [...earlier.removed, ...later.removed],
    newConflicts: [...new Set([...earlier.newConflicts, ...later.newConflicts])],
    pendingTotal: later.pendingTotal,
  };
}

/** Download the remote's state. The only thing it changes locally are remote-tracking refs. */
export async function fetchRemote(env: BackupEnv): Promise<void> {
  assertRepo(env);
  if (!(await originUrl(env))) return;
  await env.git.run(["fetch", "--prune", REMOTE_NAME], { network: true });
}

/** Fetch, then merge what arrived. */
export async function pullRemote(env: BackupEnv): Promise<MergeSummary> {
  await fetchRemote(env);
  const result = await env.ctx.lock.run("backup merge", () =>
    whileMerging(env, () => mergeRemote(env)),
  );
  return result.summary;
}

export function syncLibrary(
  env: BackupEnv,
  message: string = DEFAULT_BACKUP_COMMIT_MESSAGE,
  review?: SyncReviewAnswer,
): Promise<SyncOutcome> {
  return withStages(env, () => runSync(env, message, review));
}

async function runSync(
  env: BackupEnv,
  message: string,
  review: SyncReviewAnswer | undefined,
): Promise<SyncOutcome> {
  assertRepo(env);
  const { lock, settings } = env.ctx;
  const text = message.trim() || DEFAULT_BACKUP_COMMIT_MESSAGE;

  // A key caught before it is committed can still simply be removed; once committed, it would
  // travel with the history even after removal. Without a remote nothing leaves the computer.
  reportStage(env, "preparing");
  if (await originUrl(env)) {
    // The ignore list first: a skill back under the size limit stops being ignored now, and must
    // be checked before the commit takes it in.
    await lock.run("backup ignore list", () => refreshIgnoreFile(env));
    const uncommitted = await scanUncommittedChanges(env);
    if (uncommitted.length > 0) throw secretsFound(uncommitted);
  }

  reportStage(env, "saving");
  let committed = await lock.run("backup commit", () => commitLibrary(env, text));
  let merge: MergeSummary | null = null;
  let changed = committed;
  let snapshot: string | null = null;
  let pushed = false;

  const takeSnapshot = (): Promise<string> => {
    reportStage(env, "snapshot");
    return lock.run("backup snapshot", () => tagSnapshot(env));
  };
  // A state that was committed earlier (for example by setting up the backup) but never
  // snapshotted still deserves a restore point the first time the user backs up.
  const needsSnapshot = async (): Promise<boolean> => changed || !(await snapshotAtHead(env));

  if (!(await originUrl(env))) {
    if (await needsSnapshot()) snapshot = await takeSnapshot();
  } else {
    const branch = await requireBranch(env);
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
      reportStage(env, "downloading");
      await fetchRemote(env);
      reportStage(env, "merging");
      const result = await lock.run("backup merge", () =>
        whileMerging(env, () => mergeRemote(env, review)),
      );
      merge = combine(merge, result.summary);
      committed ||= result.committed;
      changed ||= result.committed || result.changed;
      if (await needsSnapshot()) snapshot = await takeSnapshot();

      const upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
      const { ahead } = await aheadBehind(env, branch);
      if (upstream && ahead === 0) break;

      // Everything this push sends, commits made while there was no remote included.
      const secrets = await scanForPush(env, branch);
      if (secrets.length > 0) throw secretsFound(secrets);

      await env.hooks.beforePush?.(attempt);
      reportStage(env, "uploading");
      try {
        await env.git.run(["push", "--follow-tags", "-u", REMOTE_NAME, branch], { network: true });
        pushed = true;
        break;
      } catch (error) {
        // Someone else pushed between our fetch and our push: merge their work and try again.
        if (!isAppError(error, "GIT_REJECTED") || attempt === MAX_PUSH_ATTEMPTS) throw error;
      }
    }
  }

  if (pushed) settings.set("backupLastAutoError", "");
  // The "restored from" note describes the state until it is backed up again.
  settings.deleteRaw(INTERNAL_KEYS.backupRestoredFrom);
  const merged = merge && !merge.upToDate ? `, merged ${merge.updated.length} updated` : "";
  env.ctx.activity.record(
    "backup",
    env.deviceName(),
    `${pushed ? "Pushed" : "Saved locally"}${merged}`,
  );
  env.ctx.touched("backup");
  return { committed, merge: merge && !merge.upToDate ? merge : null, pushed, snapshot };
}
