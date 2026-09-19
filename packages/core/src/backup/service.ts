import type { BackupApi } from "@skillboard/shared";
import { exists } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import type { AutoBackupTarget } from "./auto";
import { cloneLibrary } from "./clone";
import { countConflicts, listConflicts } from "./conflict-store";
import { resolveConflict } from "./conflicts";
import { deleteRemoteToken, sanitizeRemoteUrl } from "./credentials";
import { writeDeviceName } from "./device";
import { type BackupEnv, DEFAULT_BRANCH, REMOTE_NAME } from "./env";
import { createGithubService } from "./github";
import { assertRepo, commitLibrary, isRepo, originUrl } from "./repo";
import { buildSizeReport, refreshIgnoreFile } from "./size";
import { DEFAULT_SNAPSHOT_LIMIT, listSnapshots, restoreSnapshot, tagSnapshot } from "./snapshots";
import { readStatus } from "./status";
import { fetchRemote, pullRemote, syncLibrary } from "./sync";

const INITIAL_COMMIT_MESSAGE = "Initial skill library snapshot";
const SNAPSHOT_COMMIT_MESSAGE = "backup: snapshot";

export interface BackupOperations {
  api: BackupApi;
  /** What the automatic backup drives. */
  target: AutoBackupTarget;
}

export function createBackupOperations(
  env: BackupEnv,
  fetchImpl: typeof fetch | undefined,
): BackupOperations {
  const { ctx } = env;
  let fetching: Promise<void> | null = null;

  /** Point `origin` at the URL when there is a repository; always remember it. */
  async function saveRemote(url: string): Promise<void> {
    if (isRepo(env)) {
      const verb = (await originUrl(env)) ? "set-url" : "add";
      await env.git.run(["remote", verb, REMOTE_NAME, url]);
    }
    ctx.settings.setRaw(INTERNAL_KEYS.backupRemoteUrl, url);
    ctx.touched("backup");
  }

  const github = createGithubService(ctx, { fetchImpl, saveRemote });

  const api: BackupApi = {
    status: () => readStatus(env),

    fetch: async () => {
      // One download at a time: a second caller simply waits for the first.
      fetching ??= fetchRemote(env).finally(() => {
        fetching = null;
      });
      await fetching;
      ctx.touched("backup");
    },

    init: async () => {
      await ctx.lock.run("backup init", async () => {
        if (isRepo(env)) throw exists("Backup is already set up for this library.");
        await env.git.run(["init", "-q"]);
        await env.git.run(["symbolic-ref", "HEAD", `refs/heads/${DEFAULT_BRANCH}`]);
        env.portable.write();
        await refreshIgnoreFile(env);
        await env.git.run(["add", "-A"]);
        await env.git.run(["commit", "-q", "--allow-empty", "-m", INITIAL_COMMIT_MESSAGE]);
        const saved = env.remoteUrl();
        if (saved) await env.git.run(["remote", "add", REMOTE_NAME, saved]);
      });
      ctx.activity.record("backup", env.deviceName(), "Backup set up");
      ctx.touched("backup");
    },

    setRemote: async (url) => {
      const clean = await sanitizeRemoteUrl(ctx.secrets, url);
      await saveRemote(clean);
      return clean;
    },

    removeRemote: async () => {
      const urls = [env.remoteUrl(), isRepo(env) ? await originUrl(env) : null];
      if (isRepo(env) && urls[1]) await env.git.run(["remote", "remove", REMOTE_NAME]);
      for (const url of urls) if (url) await deleteRemoteToken(ctx.secrets, url);
      ctx.settings.deleteRaw(INTERNAL_KEYS.backupRemoteUrl);
      ctx.settings.deleteRaw(INTERNAL_KEYS.githubAuthMethod);
      ctx.touched("backup");
    },

    clone: async (url) => {
      await cloneLibrary(env, url, { keepCurrent: false });
    },

    reclone: async (url) => {
      await cloneLibrary(env, url, { keepCurrent: true });
    },

    sync: (message) => syncLibrary(env, message),

    pull: async () => {
      const summary = await pullRemote(env);
      ctx.touched("backup");
      return summary;
    },

    snapshots: async (limit = DEFAULT_SNAPSHOT_LIMIT) => {
      assertRepo(env);
      return listSnapshots(env, limit);
    },

    createSnapshot: async () => {
      const tag = await ctx.lock.run("backup snapshot", async () => {
        await commitLibrary(env, SNAPSHOT_COMMIT_MESSAGE);
        return tagSnapshot(env);
      });
      ctx.touched("backup");
      return tag;
    },

    restore: async (tag) => {
      assertRepo(env);
      const safety = await ctx.lock.run(`restore ${tag}`, async () => {
        const point = await restoreSnapshot(env, tag);
        await env.reconcile(true);
        return point;
      });
      ctx.activity.record("restore", tag, `Safety snapshot ${safety}`);
      return safety;
    },

    conflicts: async () => listConflicts(ctx.db),

    resolveConflict: async (skillKey, action) => {
      assertRepo(env);
      return ctx.lock.run("backup resolve conflict", () => resolveConflict(env, skillKey, action));
    },

    sizeReport: () => buildSizeReport(env),

    deviceName: async () => env.deviceName(),

    setDeviceName: async (name) => {
      const saved = writeDeviceName(ctx.settings, name);
      ctx.touched("backup");
      return saved;
    },

    githubConnect: (token, repoName) => github.connect(token, repoName, "pat"),
    githubDeviceStart: () => github.deviceStart(),
    githubDevicePoll: (deviceCode, repoName) => github.devicePoll(deviceCode, repoName),
    githubAuthMethod: async () => github.authMethod(),
    githubDeviceAvailable: async () => github.deviceAvailable(),
  };

  const target: AutoBackupTarget = {
    isRepo: () => isRepo(env),
    sync: (message) => syncLibrary(env, message),
    pendingConflicts: () => countConflicts(ctx.db),
    commitLocal: async (message, options) => {
      const work = (): Promise<boolean> => commitLibrary(env, message);
      if (!options.failFast) return ctx.lock.run("backup commit", work);
      return (await ctx.lock.tryRun("backup commit", work)) ?? false;
    },
  };

  return { api, target };
}
