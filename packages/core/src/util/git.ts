import { AppError, isAppError } from "../errors";
import { type ExecResult, exec } from "./exec";
import { BYTE_EXACT_CONFIG, configFlags, proxyConfig } from "./git-config";
import type { GitHubSignIn } from "./github-token";

/**
 * The one way Loadout runs the system `git`, for installs, updates, backup and publishing alike.
 * Every call gets the same environment and the same safety settings; callers add only what their
 * own work needs.
 */

export const GIT_BINARY = "git";
export const GIT_TIMEOUT_MS = 300_000;
/** Transports Git may use; `file` covers local repositories and folder remotes. */
export const GIT_TRANSPORTS = "https:http:ssh:git:file";
const MISSING_MESSAGE = "Git is not installed on this computer. Install Git and try again.";

/**
 * Settings forced on every call. Repositories Loadout touches hold third-party files, so nothing
 * in a repository's own config may run a program (no file-system monitor, no hook), and a checkout
 * refuses paths that only look harmless on a case-folding (macOS) or NTFS (Windows) disk.
 */
export const SAFE_GIT_CONFIG = [
  ...BYTE_EXACT_CONFIG,
  "core.fsmonitor=false",
  "core.hooksPath=/dev/null",
  "core.protectHFS=true",
  "core.protectNTFS=true",
] as const;

/** Environment every call runs with, before the call's own additions. */
export const SAFE_GIT_ENV = {
  // Never block on a prompt nobody can see, and keep messages in English so they can be classified.
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
  // Only real transports: no `<helper>::` remote helpers from a stored or restored URL.
  GIT_ALLOW_PROTOCOL: GIT_TRANSPORTS,
  // Reads such as `status` must not take `index.lock`: a write at the same moment would find it
  // and stop, taking it for an interrupted operation.
  GIT_OPTIONAL_LOCKS: "0",
} as const;

export interface GitNetwork {
  proxy: string | null;
  /** Environment that sends a token saved for this remote; it wins over `github`. */
  auth?: Record<string, string>;
  /** A GitHub token the computer already has, asked only after the user's own helpers. */
  github?: GitHubSignIn;
}

export interface GitRunOptions {
  /** Tests only: the git executable to run. */
  binary?: string;
  /** Settings for this call on top of `SAFE_GIT_CONFIG`. */
  config?: readonly string[];
  /** Options that go before the subcommand, such as `--git-dir`. */
  globalArgs?: readonly string[];
  /** The call talks to a remote: it gets the proxy and a token. */
  network?: GitNetwork;
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  signal?: AbortSignal;
  onStderrLine?: (line: string) => void;
}

async function networkEnvironment(
  network: GitNetwork | undefined,
  env: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  if (!network) return {};
  if (network.auth && Object.keys(network.auth).length > 0) return network.auth;
  return network.github ? network.github.gitEnvironment({ ...process.env, ...env }) : {};
}

/** Run git to completion. Never rejects on a non-zero exit; a missing git is `GIT_MISSING`. */
export async function runGit(args: string[], options: GitRunOptions = {}): Promise<ExecResult> {
  const config = [
    ...SAFE_GIT_CONFIG,
    ...(options.config ?? []),
    ...(options.network ? proxyConfig(options.network.proxy) : []),
  ];
  // Config flags only count when they come before the subcommand.
  const fullArgs = [...configFlags(config), ...(options.globalArgs ?? []), ...args];
  try {
    return await exec(options.binary ?? GIT_BINARY, fullArgs, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...SAFE_GIT_ENV,
        ...(await networkEnvironment(options.network, options.env)),
        ...options.env,
      },
      timeoutMs: GIT_TIMEOUT_MS,
      signal: options.signal,
      input: options.input,
      onStderrLine: options.onStderrLine,
    });
  } catch (error) {
    if (isAppError(error, "UNSUPPORTED")) throw new AppError("GIT_MISSING", MISSING_MESSAGE);
    throw error;
  }
}
