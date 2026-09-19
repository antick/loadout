import { existsSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../errors";
import { type BackupEnv, REMOTE_NAME } from "./env";
import { refreshIgnoreFile } from "./size";

/** Small questions and actions on the repository that several backup modules share. */

const GIT_DIR = ".git";
/** Files git leaves behind while an operation is unfinished. */
const INTERRUPTED_MARKERS = ["MERGE_HEAD", "index.lock", "rebase-merge", "rebase-apply"] as const;

export function isRepo(env: BackupEnv): boolean {
  return existsSync(join(env.repoDir, GIT_DIR));
}

export function assertRepo(env: BackupEnv): void {
  if (!isRepo(env)) {
    throw new AppError("GIT_NOT_REPO", "Backup is not set up for this library yet.");
  }
}

/** A merge or rebase that never finished must be dealt with before we stack more work on it. */
export function assertNotInterrupted(env: BackupEnv): void {
  const marker = INTERRUPTED_MARKERS.find((name) => existsSync(join(env.repoDir, GIT_DIR, name)));
  if (marker) {
    throw new AppError(
      "GIT",
      "An earlier Git operation in the library folder did not finish. Finish or abort it in a terminal, or restore the library from the backup remote, then try again.",
      { marker },
    );
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

export async function isDirty(env: BackupEnv): Promise<boolean> {
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
 * Bring the repository up to date with the database and the disk, then commit.
 * Must run inside the library lock. Returns whether a commit was made.
 */
export async function commitLibrary(env: BackupEnv, message: string): Promise<boolean> {
  assertRepo(env);
  assertNotInterrupted(env);
  env.portable.write();
  await refreshIgnoreFile(env);
  return commitStaged(env, message);
}
