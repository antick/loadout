import {
  DEFAULT_BACKUP_COMMIT_MESSAGE,
  type MergeSummary,
  type SyncOutcome,
} from "@skillboard/shared";
import { isAppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { type BackupEnv, REMOTE_NAME } from "./env";
import { mergeRemote } from "./merge";
import {
  aheadBehind,
  assertRepo,
  commitLibrary,
  originUrl,
  requireBranch,
  resolveCommit,
  upstreamRef,
} from "./repo";
import { tagSnapshot } from "./snapshots";

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
  const result = await env.ctx.lock.run("backup merge", () => mergeRemote(env));
  return result.summary;
}

export async function syncLibrary(
  env: BackupEnv,
  message: string = DEFAULT_BACKUP_COMMIT_MESSAGE,
): Promise<SyncOutcome> {
  assertRepo(env);
  const { lock, settings } = env.ctx;
  const text = message.trim() || DEFAULT_BACKUP_COMMIT_MESSAGE;

  let committed = await lock.run("backup commit", () => commitLibrary(env, text));
  let merge: MergeSummary | null = null;
  let changed = committed;
  let snapshot: string | null = null;
  let pushed = false;

  const takeSnapshot = (): Promise<string> => lock.run("backup snapshot", () => tagSnapshot(env));

  if (!(await originUrl(env))) {
    if (changed) snapshot = await takeSnapshot();
  } else {
    const branch = await requireBranch(env);
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
      await fetchRemote(env);
      const result = await lock.run("backup merge", () => mergeRemote(env));
      merge = combine(merge, result.summary);
      committed ||= result.committed;
      changed ||= result.committed || result.changed;
      if (changed) snapshot = await takeSnapshot();

      const upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
      const { ahead } = await aheadBehind(env, branch);
      if (upstream && ahead === 0) break;

      await env.hooks.beforePush?.(attempt);
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
