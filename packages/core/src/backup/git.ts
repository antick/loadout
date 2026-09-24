import type { ErrorCode } from "@loadout/shared";
import type { SecretStore } from "../context";
import { AppError, isAppError } from "../errors";
import { type ExecResult, exec } from "../util/exec";
import { BYTE_EXACT_CONFIG, configFlags, proxyConfig } from "../util/git-config";
import { authEnvironment, maskUrlCredentials } from "./credentials";
import { deviceEmail } from "./device";

/** The one place the backup feature talks to the system `git`. */

const GIT_BINARY = "git";
const GIT_TIMEOUT_MS = 300_000;
const MAX_DETAIL_LENGTH = 600;
/**
 * Settings forced on every call so a backup behaves the same on every device:
 * bytes are stored as they are, paths are printed verbatim, and an unattended commit never stops
 * to ask for a signing passphrase.
 */
const FIXED_CONFIG = [
  ...BYTE_EXACT_CONFIG,
  "core.quotepath=false",
  "commit.gpgsign=false",
  "tag.gpgsign=false",
  "advice.detachedHead=false",
] as const;
const SSH_NOISE = /^(warning: permanently added|\*\* |debug\d:)/i;

export type GitErrorCode = Extract<
  ErrorCode,
  | "GIT"
  | "GIT_AUTH"
  | "NETWORK"
  | "GIT_UNRELATED"
  | "GIT_REJECTED"
  | "GIT_NO_UPSTREAM"
  | "SYNC_CONFLICT"
  | "GIT_NOT_REPO"
>;

/**
 * First match wins, so the specific causes come before the broad "conflict" rule: git's hints
 * for other failures can mention that word too.
 */
const ERROR_RULES: readonly (readonly [GitErrorCode, RegExp])[] = [
  [
    "NETWORK",
    /connection refused|could not resolve host|failed to connect|connection timed out|network is unreachable|unable to access .*(timed out|ssl|tls)/i,
  ],
  ["GIT_AUTH", /authentication failed|permission denied|could not read username|http 40[13]\b/i],
  ["GIT_UNRELATED", /unrelated histories|refusing to merge/i],
  ["GIT_REJECTED", /\[rejected\]|non-fast-forward|fetch first|failed to push some refs/i],
  ["GIT_NO_UPSTREAM", /no upstream|has no upstream branch/i],
  ["SYNC_CONFLICT", /conflict/i],
  ["GIT_NOT_REPO", /not a git repository/i],
];

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

export function classifyGitError(output: string): GitErrorCode {
  for (const [code, pattern] of ERROR_RULES) if (pattern.test(output)) return code;
  return "GIT";
}

/** Strip SSH chatter and credentials from git's output before it is shown or logged. */
export function cleanGitOutput(output: string): string {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() && !SSH_NOISE.test(line.trim()));
  return maskUrlCredentials(lines.join("\n")).slice(0, MAX_DETAIL_LENGTH);
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
}

export function createGit(deps: GitDeps): Git {
  let availability: Promise<boolean> | null = null;

  async function probe(args: string[], options: GitCallOptions = {}): Promise<ExecResult> {
    const config: string[] = [...FIXED_CONFIG];
    const device = deps.deviceName();
    config.push(`user.name=${device}`, `user.email=${deviceEmail(device)}`);
    let authEnv: Record<string, string> = {};
    if (options.network) {
      config.push(...proxyConfig(deps.proxy()));
      authEnv = await authEnvironment(deps.secrets, options.remoteUrl ?? deps.remoteUrl());
    }
    const fullArgs = [...configFlags(config), ...(options.globalArgs ?? []), ...args];
    try {
      return await exec(GIT_BINARY, fullArgs, {
        cwd: options.cwd ?? deps.repoDir,
        env: {
          ...process.env,
          // Never block on a prompt nobody can see, and keep messages in English so
          // `classifyGitError` recognises them.
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          ...authEnv,
          ...options.env,
        },
        timeoutMs: GIT_TIMEOUT_MS,
        signal: options.signal,
        input: options.input,
      });
    } catch (error) {
      if (isAppError(error, "UNSUPPORTED")) {
        throw new AppError(
          "GIT_MISSING",
          "Git is not installed on this computer. Install Git and try again.",
        );
      }
      throw error;
    }
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
