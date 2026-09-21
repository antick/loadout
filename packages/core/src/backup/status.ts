import { type BackupStatus, SNAPSHOT_TAG_PREFIX, type UpstreamHealth } from "@loadout/shared";
import { INTERNAL_KEYS } from "../settings/store";
import { maskUrlCredentials } from "./credentials";
import type { BackupEnv } from "./env";
import { aheadBehind, currentBranch, isRepo, originUrl, resolveCommit, upstreamRef } from "./repo";

const MS_PER_SECOND = 1000;
const FIELD_SEPARATOR = "\0";
/** Porcelain status letters that are followed by a second path (the old name). */
const RENAME_CODES = /[RC]/;

/**
 * Distinct top-level folders named in `git status --porcelain -z` output. Entries starting with a
 * dot (our metadata, `.gitignore`) are not skills. A rename counts once, under its new name.
 */
export function countChangedSkills(porcelain: string): number {
  const fields = porcelain.split(FIELD_SEPARATOR).filter(Boolean);
  const folders = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? "";
    const code = field.slice(0, 2);
    const path = field.slice(3);
    if (RENAME_CODES.test(code)) index += 1;
    const top = path.split("/")[0] ?? "";
    if (top && !top.startsWith(".")) folders.add(top);
  }
  return folders.size;
}

async function upstreamHealth(
  env: BackupEnv,
  remote: string | null,
  branch: string | null,
): Promise<UpstreamHealth> {
  if (!remote) return "no_remote";
  if (!branch) return "detached";
  const upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
  if (!upstream) return "no_upstream";
  // Before the first commit there is nothing to be unrelated to.
  if (!(await resolveCommit(env, "HEAD"))) return "healthy";
  const base = await env.git.probe(["merge-base", "HEAD", upstream]);
  return base.code === 0 ? "healthy" : "unrelated_histories";
}

export async function readStatus(env: BackupEnv): Promise<BackupStatus> {
  const gitAvailable = await env.git.available();
  const savedRemote = env.remoteUrl();
  const restoredFrom =
    env.ctx.settings.getRaw<string | null>(INTERNAL_KEYS.backupRestoredFrom, null) || null;
  if (!gitAvailable || !isRepo(env)) {
    return {
      // Without git the folder can still be seen to be a repository; the UI then asks for git.
      isRepo: isRepo(env),
      remoteUrl: savedRemote ? maskUrlCredentials(savedRemote) : null,
      branch: null,
      hasChanges: false,
      changedSkillCount: 0,
      ahead: 0,
      behind: 0,
      lastCommit: null,
      lastCommitAt: null,
      currentSnapshot: null,
      restoredFrom: null,
      upstreamHealth: "no_remote",
      gitAvailable,
    };
  }

  const [remote, branch, porcelain, lastCommit, snapshotTags] = await Promise.all([
    originUrl(env),
    currentBranch(env),
    env.git.run(["status", "--porcelain", "-z"]),
    env.git.probe(["log", "-1", "--format=%ct%x00%s"]),
    env.git.probe([
      "tag",
      "--points-at",
      "HEAD",
      "--sort=-creatordate",
      "--list",
      `${SNAPSHOT_TAG_PREFIX}*`,
    ]),
  ]);
  const counts = remote && branch ? await aheadBehind(env, branch) : { ahead: 0, behind: 0 };
  const [commitTime, ...subject] =
    lastCommit.code === 0 ? lastCommit.stdout.trim().split(FIELD_SEPARATOR) : [];

  return {
    isRepo: true,
    remoteUrl: remote ? maskUrlCredentials(remote) : null,
    branch,
    hasChanges: porcelain.stdout.length > 0,
    changedSkillCount: countChangedSkills(porcelain.stdout),
    ahead: counts.ahead,
    behind: counts.behind,
    lastCommit: commitTime ? subject.join(FIELD_SEPARATOR) : null,
    lastCommitAt: commitTime ? Number(commitTime) * MS_PER_SECOND : null,
    currentSnapshot:
      snapshotTags.code === 0 ? snapshotTags.stdout.split(/\r?\n/).find(Boolean) || null : null,
    restoredFrom,
    upstreamHealth: await upstreamHealth(env, remote, branch),
    gitAvailable,
  };
}
