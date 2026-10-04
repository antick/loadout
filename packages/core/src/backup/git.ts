import type { SecretStore } from "../context";
import { AppError } from "../errors";
import type { ExecResult } from "../util/exec";
import { runGit } from "../util/git";
import { type GitErrorCode, classifyGitError, gitOutputLines } from "../util/git-errors";
import type { GitHubSignIn } from "../util/github-token";
import { authEnvironment, maskUrlCredentials } from "./credentials";
import { deviceEmail } from "./device";

/** The one place the backup feature talks to the system `git` (through `util/git`). */

const MAX_DETAIL_LENGTH = 600;
/**
 * Settings on top of the shared safe ones, so a backup behaves the same on every device: paths
 * are printed verbatim, and an unattended commit never stops to ask for a signing passphrase.
 */
const BACKUP_CONFIG = [
  "core.quotepath=false",
  "commit.gpgsign=false",
  "tag.gpgsign=false",
  "advice.detachedHead=false",
  // A backup remote is not trusted blindly: refuse objects that name `..` or `.git`. Installs
  // leave this off, as some public repositories carry harmless old objects it would refuse.
  "transfer.fsckObjects=true",
] as const;

const ERROR_TEXT: Record<GitErrorCode, string> = {
  NETWORK: "Could not reach the backup remote. Check your internet connection and proxy setting.",
  GIT_AUTH:
    "The backup remote refused the sign-in. Check that the token or SSH key is still valid and has access to the repository.",
  GIT_UNRELATED:
    "The backup remote holds a different library with no shared history, so the two cannot be merged.",
  GIT_REJECTED: "Another device pushed to the backup at the same time. Sync again to merge first.",
  GIT_NO_UPSTREAM: "This library has not been pushed to the backup remote yet.",
  SYNC_CONFLICT: "The same files were changed on two devices and could not be merged.",
  GIT_NOT_REPO: "Backup is not set up for this library yet.",
  GIT: "Git could not finish the operation.",
};

/** Strip SSH chatter and credentials from git's output before it is shown or logged. */
export function cleanGitOutput(output: string): string {
  return maskUrlCredentials(gitOutputLines(output).join("\n")).slice(0, MAX_DETAIL_LENGTH);
}

export function gitError(output: string, fallback: GitErrorCode = "GIT"): AppError {
  const detail = cleanGitOutput(output);
  const classified = classifyGitError(detail);
  const code = classified === "GIT" ? fallback : classified;
  const message = code === "GIT" && detail ? `${ERROR_TEXT.GIT} ${detail}` : ERROR_TEXT[code];
  return new AppError(code, message, { detail });
}

export interface GitCallOptions {
  /** The call talks to the remote: gets the proxy and the stored token. */
  network?: boolean;
  /** Remote being contacted when it is not the saved one yet (clone). */
  remoteUrl?: string;
  signal?: AbortSignal;
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  /** Options that go before the subcommand, such as `--git-dir`. */
  globalArgs?: string[];
}

export interface Git {
  /** Run to completion; a non-zero exit throws a classified `AppError`. */
  run(args: string[], options?: GitCallOptions): Promise<ExecResult>;
  /** Like `run`, returning trimmed stdout. */
  text(args: string[], options?: GitCallOptions): Promise<string>;
  /** Run and hand back the result whatever the exit code, for questions git answers by failing. */
  probe(args: string[], options?: GitCallOptions): Promise<ExecResult>;
  available(): Promise<boolean>;
}

export interface GitDeps {
  repoDir: string;
  secrets: SecretStore;
  deviceName(): string;
  proxy(): string | null;
  /** Saved remote URL, used to look up the token for network calls. */
  remoteUrl(): string | null;
  /** A GitHub token the computer already has, used when none is saved for the remote. */
  github?: GitHubSignIn;
}

export function createGit(deps: GitDeps): Git {
  let availability: Promise<boolean> | null = null;

  async function probe(args: string[], options: GitCallOptions = {}): Promise<ExecResult> {
    const device = deps.deviceName();
    return runGit(args, {
      config: [...BACKUP_CONFIG, `user.name=${device}`, `user.email=${deviceEmail(device)}`],
      globalArgs: options.globalArgs,
      // A saved token is sent outright; otherwise the computer's own is git's last helper.
      network: options.network
        ? {
            proxy: deps.proxy(),
            auth: await authEnvironment(deps.secrets, options.remoteUrl ?? deps.remoteUrl()),
            github: deps.github,
          }
        : undefined,
      cwd: options.cwd ?? deps.repoDir,
      env: options.env,
      signal: options.signal,
      input: options.input,
    });
  }

  async function run(args: string[], options?: GitCallOptions): Promise<ExecResult> {
    const result = await probe(args, options);
    if (result.code !== 0) throw gitError(`${result.stderr}\n${result.stdout}`);
    return result;
  }

  return {
    run,
    probe,
    text: async (args, options) => (await run(args, options)).stdout.trim(),
    available: async () => {
      availability ??= probe(["--version"]).then(
        (result) => result.code === 0,
        () => false,
      );
      const found = await availability;
      // Only a "yes" is remembered, so installing Git while the app runs is noticed.
      if (!found) availability = null;
      return found;
    },
  };
}
