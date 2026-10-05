import { existsSync } from "node:fs";
import { join } from "node:path";
import { SECOND_MS } from "@loadout/shared";
import { AppError } from "../errors";
import { GIT_DIR } from "../util/fs";
import { type BackupEnv, REMOTE_NAME } from "./env";
import { gitError } from "./git";
import { recoverInterrupted } from "./interrupted";
import { refreshIgnoreFile } from "./size";

/** Small questions and actions on the repository that several backup modules share. */

/** A commit time as git prints it (`%ct`, seconds), in milliseconds. */
export function commitTimeMs(seconds: string): number {
  return Number(seconds) * SECOND_MS;
}

export function isRepo(env: BackupEnv): boolean {
  return existsSync(join(env.repoDir, GIT_DIR));
}

export function assertRepo(env: BackupEnv): void {
  if (!isRepo(env)) {
    throw new AppError("GIT_NOT_REPO", "Backup is not set up for this library yet.");
  }
}

/** Branch name, or null when HEAD is detached. */
export async function currentBranch(env: BackupEnv): Promise<string | null> {
  const result = await env.git.probe(["symbolic-ref", "--short", "-q", "HEAD"]);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

export async function requireBranch(env: BackupEnv): Promise<string> {
  const branch = await currentBranch(env);
  if (!branch) {
    throw new AppError(
      "GIT",
      "The library folder is not on a branch, so it cannot be synced. Check out a branch in a terminal, or restore the library from the backup remote.",
    );
  }
  return branch;
}

/** Commit id for a revision, or null when it does not exist. */
export async function resolveCommit(env: BackupEnv, revision: string): Promise<string | null> {
  const result = await env.git.probe(["rev-parse", "-q", "--verify", `${revision}^{commit}`]);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

export function upstreamRef(branch: string): string {
  return `${REMOTE_NAME}/${branch}`;
}

/** The commit `origin/<branch>` was at when last fetched; null before there is one. */
export function upstreamCommit(env: BackupEnv, branch: string): Promise<string | null> {
  return resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
}

/** True when `commit` is in the current branch's history. */
export async function inHistory(env: BackupEnv, commit: string): Promise<boolean> {
  const result = await env.git.probe(["merge-base", "--is-ancestor", commit, "HEAD"]);
  return result.code === 0;
}

/** The commit two histories share last; refused when they share none. */
export async function mergeBase(env: BackupEnv, ours: string, theirs: string): Promise<string> {
  const result = await env.git.probe(["merge-base", ours, theirs]);
  const base = result.code === 0 ? result.stdout.trim() : "";
  if (!base) throw gitError("refusing to merge unrelated histories");
  return base;
}

/** URL of `origin` as git knows it, or null when there is no remote. */
export async function originUrl(env: BackupEnv): Promise<string | null> {
  const result = await env.git.probe(["remote", "get-url", REMOTE_NAME]);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

export async function aheadBehind(
  env: BackupEnv,
  branch: string,
): Promise<{ ahead: number; behind: number }> {
  const result = await env.git.probe([
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...${upstreamRef(branch)}`,
  ]);
  if (result.code !== 0) return { ahead: 0, behind: 0 };
  const [ahead, behind] = result.stdout.trim().split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

async function isDirty(env: BackupEnv): Promise<boolean> {
  return (await env.git.text(["status", "--porcelain"])) !== "";
}

/** Stage everything and commit when something changed. Does not rewrite the portable metadata. */
export async function commitStaged(env: BackupEnv, message: string): Promise<boolean> {
  await env.git.run(["add", "-A"]);
  if (!(await isDirty(env))) return false;
  await env.git.run(["commit", "-q", "-m", message]);
  return true;
}

/**
 * What a commit must find first: no unfinished git operation, and the portable metadata and the
 * ignore file as the database and the disk are now. Must run inside the library lock.
 */
export async function prepareCommit(env: BackupEnv): Promise<void> {
  assertRepo(env);
  await recoverInterrupted(env);
  env.portable.write();
  await refreshIgnoreFile(env);
}

/**
 * Bring the repository up to date with the database and the disk, then commit.
 * Must run inside the library lock. Returns whether a commit was made.
 */
export async function commitLibrary(env: BackupEnv, message: string): Promise<boolean> {
  await prepareCommit(env);
  return commitStaged(env, message);
}
