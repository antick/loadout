import type { BackupApi } from "@loadout/shared";
import { exists, isAppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import type { AutoBackupTarget } from "./auto";
import { cloneLibrary } from "./clone";
import { countConflicts, listConflicts } from "./conflict-store";
import { resolveConflicts } from "./conflicts";
import { sanitizeRemoteUrl } from "./credentials";
import { writeDeviceName } from "./device";
import { type BackupEnv, DEFAULT_BRANCH, REMOTE_NAME } from "./env";
import { createGithubService } from "./github";
import { assertRepo, currentBranch, isRepo, originUrl } from "./repo";
import { cleanUpUnpushed } from "./history-cleanup";
import { readIgnoreRules, writeIgnoreRules } from "./ignore-rules";
import { allowSecrets, commitLibraryChecked, scanForPush } from "./secrets";
import { buildSizeReport, refreshIgnoreFile } from "./size";
import {
  DEFAULT_SNAPSHOT_LIMIT,
  describeRestorePoint,
  listSnapshots,
  restoreSnapshot,
} from "./snapshots";
import { conflictDiff, currentLocalTree, previewDiff, previewSync } from "./review";
import { readStatus } from "./status";
import { fetchRemote, pullRemote, syncLibrary } from "./sync";
import type { HttpRequest } from "../install/download";

const INITIAL_COMMIT_MESSAGE = "Initial skill library snapshot";

export interface BackupOperations {
  api: BackupApi;
  /** What the automatic backup drives. */
  target: AutoBackupTarget;
}

export function createBackupOperations(env: BackupEnv, request: HttpRequest): BackupOperations {
  const { ctx } = env;
  let fetching: Promise<void> | null = null;

  /**
   * Point `origin` at the URL when there is a repository; always remember it. The caller says
   * the backup changed, once it has its whole answer.
   */
  async function saveRemote(url: string): Promise<void> {
    // `git remote` writes the repository's config: never while a merge or commit works in it.
    await ctx.lock.run("set the backup remote", async () => {
      if (isRepo(env)) {
        const verb = (await originUrl(env)) ? "set-url" : "add";
        await env.git.run(["remote", verb, REMOTE_NAME, url]);
      }
      ctx.settings.setRaw(INTERNAL_KEYS.backupRemoteUrl, url);
    });
  }

  const github = createGithubService(ctx, { request, saveRemote });

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
      ctx.touched("backup");
      return clean;
    },

    removeRemote: async () => {
      await ctx.lock.run("remove the backup remote", async () => {
        if (isRepo(env) && (await originUrl(env))) {
          await env.git.run(["remote", "remove", REMOTE_NAME]);
        }
      });
      // The token stays in the keychain: it belongs to the host, and publishing there uses it too.
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

    sync: (message, review, options) => syncLibrary(env, message, review, options),

    pull: async () => {
      const summary = await pullRemote(env);
      ctx.touched("backup");
      return summary;
    },

    preview: () => previewSync(env),

    localTree: () => currentLocalTree(env),

    previewDiff: (skillId, remoteCommit) => previewDiff(env, skillId, remoteCommit),

    conflictDiff: (skillKey) => conflictDiff(env, skillKey),

    snapshots: async (limit = DEFAULT_SNAPSHOT_LIMIT) => {
      assertRepo(env);
      return listSnapshots(env, limit);
    },

    restorePoint: async (id) => {
      assertRepo(env);
      return describeRestorePoint(env, id);
    },

    restore: async (id) => {
      assertRepo(env);
      const safety = await ctx.lock.run(`restore ${id}`, async () => {
        const point = await restoreSnapshot(env, id);
        await env.reconcile("authoritative");
        return point;
      });
      ctx.activity.record("restore", id, `Safety snapshot ${safety}`);
      return safety;
    },

    conflicts: async () => listConflicts(ctx.db),

    resolveConflicts: async (skillKeys, action) => {
      assertRepo(env);
      return ctx.lock.run("backup resolve conflicts", () =>
        resolveConflicts(env, skillKeys, action),
      );
    },

    secretFindings: async () => {
      if (!isRepo(env) || !(await originUrl(env))) return [];
      const branch = await currentBranch(env);
      return branch ? scanForPush(env, branch) : [];
    },

    cleanUpUnpushed: () => cleanUpUnpushed(env),

    allowSecrets: async (ids) => {
      allowSecrets(env, ids);
      ctx.touched("backup");
    },

    sizeReport: () => buildSizeReport(env),

    ignoreRules: async () => readIgnoreRules(env),

    setIgnoreRules: async (custom) => {
      const rules = await ctx.lock.run("backup ignore rules", () => writeIgnoreRules(env, custom));
      ctx.touched("backup");
      return rules;
    },

    deviceName: async () => env.deviceName(),

    answerFirstRun: async () => {
      ctx.settings.setRaw(INTERNAL_KEYS.backupFirstRunAnswered, true);
      ctx.touched("backup");
    },

    setDeviceName: async (name) => {
      const saved = writeDeviceName(ctx.settings, name);
      ctx.touched("backup");
      return saved;
    },

    githubConnect: (token, repoName) => github.connect(token, repoName, "pat"),
    githubDeviceStart: () => github.deviceStart(),
    githubDevicePoll: (deviceCode, repoName) => github.devicePoll(deviceCode, repoName),
    githubAuthMethod: async () => github.authMethod(),
    githubConfirmPublic: (confirmId) => github.confirmPublic(confirmId),
    githubDiscardPublic: async (confirmId) => github.discardPublic(confirmId),
    githubDeviceAvailable: async () => github.deviceAvailable(),
  };

  const target: AutoBackupTarget = {
    isRepo: () => isRepo(env),
    sync: (message) => syncLibrary(env, message),
    pendingConflicts: () => countConflicts(ctx.db),
    commitLocal: async (message) => {
      await ctx.lock.tryRun("backup commit", async () => {
        // A save on quit must not bake a key into history the next push would carry. Checked
        // after the metadata and ignore file are brought up to date, so it sees what is committed.
        try {
          await commitLibraryChecked(env, message);
        } catch (error) {
          if (!isAppError(error, "SECRETS_FOUND")) throw error;
          ctx.log.warn("Not saving the library locally: a change looks like a key or token");
        }
      });
    },
  };

  return { api, target };
}
