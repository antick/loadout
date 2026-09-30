import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_NAME, APP_SLUG } from "@loadout/shared";
import { type Git, type GitCallOptions, createGit } from "../backup/git";
import type { CoreContext } from "../context";
import { AppError, invalid, isAppError } from "../errors";
import type { ExecResult } from "../util/exec";
import { ensureDir, removePath } from "../util/fs";
import type { ResolvedTarget } from "./target";

/**
 * A working copy of the target repository, kept under the cache folder and made to match the
 * remote every time, so publishing starts from what is really there. It is ours alone: nothing
 * in it is ever a user's own work, so it may be reset and cleaned freely.
 */

const REMOTE = "origin";
const REMOTE_HEADS = `refs/remotes/${REMOTE}/`;
const FALLBACK_BRANCH = "main";
const COMMON_BRANCHES = ["main", "master"] as const;
/** Errors that say something about the user's setup, not about a damaged working copy. */
const SETUP_ERRORS = ["NETWORK", "GIT_AUTH", "GIT_MISSING"] as const;

export interface Checkout {
  dir: string;
  git: Git;
  /** The branch the skills are committed to. */
  branch: string;
  /** The repository's default branch; null when it has no commits yet. */
  defaultBranch: string | null;
  repoEmpty: boolean;
  /** `branch` does not exist in the repository yet. */
  newBranch: boolean;
  /** Run git in the working copy; `network` calls carry the proxy and the saved token. */
  run(args: string[], network?: boolean): Promise<ExecResult>;
  text(args: string[], network?: boolean): Promise<string>;
}

interface Identity {
  name: string;
  email: string;
}

/**
 * The person's own Git name and e-mail, so a public repository does not show a device name.
 * Read from the user-level and system-level config: every call through `createGit` carries a
 * device identity as a command-line setting, which a plain `git config --get` would report.
 */
async function commitIdentity(git: Git, cwd: string): Promise<Identity> {
  const read = async (key: string): Promise<string> => {
    for (const scope of ["--global", "--system"]) {
      const result = await git.probe(["config", scope, "--get", key], { cwd });
      if (result.code === 0 && result.stdout.trim()) return result.stdout.trim();
    }
    return "";
  };
  return {
    name: (await read("user.name")) || APP_NAME,
    email: (await read("user.email")) || `${APP_SLUG}@localhost`,
  };
}

export async function openCheckout(ctx: CoreContext, target: ResolvedTarget): Promise<Checkout> {
  const { cacheDir: dir, url } = target;
  const git = createGit({
    repoDir: dir,
    secrets: ctx.secrets,
    // Never the device name: this commit may be read by anyone.
    deviceName: () => APP_NAME,
    proxy: () => ctx.settings.proxy(),
    remoteUrl: () => url,
  });
  const network: GitCallOptions = { network: true, remoteUrl: url };

  async function clone(): Promise<void> {
    await removePath(dir);
    ensureDir(dirname(dir));
    await git.run(["clone", "--quiet", "--no-checkout", "--", url, dir], {
      ...network,
      cwd: dirname(dir),
    });
  }

  async function refresh(): Promise<boolean> {
    if (!existsSync(join(dir, ".git"))) {
      await clone();
      return false;
    }
    const remote = await git.probe(["remote", "get-url", REMOTE]);
    if (remote.code !== 0 || remote.stdout.trim() !== url) {
      await clone();
      return false;
    }
    try {
      await git.run(["fetch", "--quiet", "--prune", "--no-tags", REMOTE], network);
      return true;
    } catch (error) {
      if (SETUP_ERRORS.some((code) => isAppError(error, code))) throw error;
      // A damaged working copy is only a cache: start again.
      await clone();
      return false;
    }
  }

  async function remoteBranches(): Promise<string[]> {
    const listing = await git.text(["for-each-ref", "--format=%(refname)", REMOTE_HEADS]);
    return listing
      .split("\n")
      .filter((ref) => ref.startsWith(REMOTE_HEADS))
      .map((ref) => ref.slice(REMOTE_HEADS.length))
      .filter((name) => name && name !== "HEAD");
  }

  async function defaultBranchOf(branches: readonly string[]): Promise<string | null> {
    const head = await git.probe(["symbolic-ref", "--short", "-q", `${REMOTE_HEADS}HEAD`]);
    const named = head.code === 0 ? head.stdout.trim().slice(REMOTE.length + 1) : "";
    if (named && branches.includes(named)) return named;
    return COMMON_BRANCHES.find((name) => branches.includes(name)) ?? branches[0] ?? null;
  }

  let reused = await refresh();
  let branches = await remoteBranches();
  if (reused && branches.length === 0) {
    // An empty repository cannot have moved on; a working copy of it may hold a failed push.
    await clone();
    reused = false;
    branches = await remoteBranches();
  }
  const repoEmpty = branches.length === 0;
  const defaultBranch = await defaultBranchOf(branches);
  const branch = target.branch ?? defaultBranch ?? FALLBACK_BRANCH;
  const named = branch.startsWith("-")
    ? null
    : await git.probe(["check-ref-format", "--branch", branch]);
  if (named?.code !== 0) throw invalid(`"${branch}" is not a branch name Git accepts.`);

  const newBranch = !branches.includes(branch);
  if (repoEmpty) {
    await git.run(["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  } else {
    const start = newBranch ? (defaultBranch ?? "") : branch;
    if (!start) throw new AppError("GIT", "The repository has no branch to start from.");
    await git.run(["checkout", "--quiet", "--force", "-B", branch, `${REMOTE_HEADS}${start}`]);
    await git.run(["clean", "--quiet", "-fdx"]);
  }

  const identity = await commitIdentity(git, dir);
  const identityEnv = {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
  const withOptions = (isNetwork: boolean): GitCallOptions => ({
    ...(isNetwork ? network : {}),
    env: identityEnv,
  });
  return {
    dir,
    git,
    branch,
    defaultBranch,
    repoEmpty,
    newBranch,
    run: (args, isNetwork = false) => git.run(args, withOptions(isNetwork)),
    text: (args, isNetwork = false) => git.text(args, withOptions(isNetwork)),
  };
}
