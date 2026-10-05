import type { SecretStore } from "../context";
import { AppError } from "../errors";
import type { ExecResult } from "../util/exec";
import { runGit } from "../util/git";
import { type GitErrorCode, classifyGitError, gitOutputLines } from "../util/git-errors";
import type { GitHubSignIn } from "../util/github-token";
import { authEnvironment, maskUrlCredentials } from "./credentials";
import { deviceEmail } from "./device";

/**
 * The one place the backup feature talks to the system `git` (through `util/git`). Publishing
 * uses it too, with its own settings and wording.
 */

const MAX_DETAIL_LENGTH = 600;
/**
 * Settings on top of the shared safe ones, so a repository Loadout commits to behaves the same
 * on every device: paths are printed verbatim, and an unattended commit never stops to ask for a
 * signing passphrase.
 */
export const COMMIT_GIT_CONFIG = [
  "core.quotepath=false",
  "commit.gpgsign=false",
  "tag.gpgsign=false",
  "advice.detachedHead=false",
] as const;
export const BACKUP_GIT_CONFIG = [
  ...COMMIT_GIT_CONFIG,
  // A backup remote is not trusted blindly: refuse objects that name `..` or `.git`. Installs
  // and publishing leave this off, as some public repositories carry harmless old objects it
  // would refuse.
  "transfer.fsckObjects=true",
] as const;

/** What each kind of failure says to the user. */
export type GitErrorText = Readonly<Record<GitErrorCode, string>>;

export const BACKUP_ERROR_TEXT: GitErrorText = {
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

export function gitError(
  output: string,
  fallback: GitErrorCode = "GIT",
  text: GitErrorText = BACKUP_ERROR_TEXT,
): AppError {
  const detail = cleanGitOutput(output);
  const classified = classifyGitError(detail);
  const code = classified === "GIT" ? fallback : classified;
  const message = code === "GIT" && detail ? `${text.GIT} ${detail}` : text[code];
  return new AppError(code, message, { detail });
}

export interface GitCallOptions {
  /** The call talks to the remote: gets the proxy and the stored token. */
  network?: boolean;
  /** Remote being contacted when it is not the saved one yet (clone). */
  remoteUrl?: string;
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  /** Options that go before the subcommand, such as `--git-dir`. */
  globalArgs?: string[];
  /** `"buffer"`: stdout comes back as bytes (`stdoutBytes`), for output that is not text. */
  encoding?: "utf8" | "buffer";
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
  /** Settings every call carries, on top of the shared safe ones and the identity. */
  config: readonly string[];
  errorText: GitErrorText;
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
      config: [...deps.config, `user.name=${device}`, `user.email=${deviceEmail(device)}`],
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
      input: options.input,
      encoding: options.encoding,
    });
  }

  async function run(args: string[], options?: GitCallOptions): Promise<ExecResult> {
    const result = await probe(args, options);
    if (result.code !== 0) {
      throw gitError(`${result.stderr}\n${result.stdout}`, "GIT", deps.errorText);
    }
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
