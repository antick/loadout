/**
 * Git helpers for fixtures, shared by the core and cli tests and the desktop browser preview
 * (`apps/desktop/dev-server/session`). Only Node here: the preview is no vitest process.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const GIT_FIXTURE_BRANCH = "main";

/**
 * Config every fixture process reads: Git's own background upkeep after commits and fetches is a
 * process per call and tests nothing, and a new repository starts on the fixture branch.
 */
export const GIT_FIXTURE_CONFIG = [
  "[maintenance]",
  "\tauto = false",
  "[gc]",
  "\tauto = 0",
  "[init]",
  `\tdefaultBranch = ${GIT_FIXTURE_BRANCH}`,
  "",
].join("\n");

/** Config text sending `https://<host>/` addresses to the bare repositories under `remotesDir/<host>/`. */
export function gitRewriteConfig(remotesDir: string, hosts: readonly string[]): string {
  return hosts
    .map((host) => `[url "${join(remotesDir, host)}/"]\n\tinsteadOf = https://${host}/\n`)
    .join("");
}

export type GitRunner = (cwd: string, ...args: string[]) => string;

/** A `git` runner whose processes get `env` on top of this process's environment. */
export function gitRunner(env: Record<string, string> = {}): GitRunner {
  return (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

export const rawGit: GitRunner = gitRunner();

/** An empty bare repository in `dir` on the fixture branch, unless one is there already. */
export function initBareRepository(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    rawGit(dir, "init", "--quiet", "--bare", `--initial-branch=${GIT_FIXTURE_BRANCH}`);
  }
  return dir;
}
