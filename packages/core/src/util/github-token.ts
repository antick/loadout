import type { GitHubSignInOrigin } from "@loadout/shared";
import type { EnvReader } from "../context";
import { exec } from "./exec";

/**
 * A GitHub token this computer already has: `GITHUB_TOKEN`, `GH_TOKEN`, or the GitHub CLI's own
 * sign-in (`gh auth token`). Git gets it as the last credential helper for github.com, so the
 * user's own helpers, SSH keys and a token saved in Loadout are always asked first; it only fills
 * in where nothing else answers. The token travels in git's environment, never on a command line,
 * in a URL, in `.git/config` or in a log line.
 */

export interface GitHubSignIn {
  /**
   * Where the token came from, or null when there is none. A found token is trusted for a while,
   * a missing one is looked for again soon, so signing in to `gh` needs no restart.
   */
  origin(): Promise<GitHubSignInOrigin | null>;
  /**
   * Environment that adds the token as git's last helper for github.com, after any `GIT_CONFIG_*`
   * entries `base` already holds. Empty without a token.
   */
  gitEnvironment(base?: NodeJS.ProcessEnv): Promise<Record<string, string>>;
}

const ENV_NAMES = ["GITHUB_TOKEN", "GH_TOKEN"] as const;
const GH_BINARY = "gh";
const GH_ARGS = ["auth", "token", "--hostname", "github.com"];
const GH_TIMEOUT_MS = 5_000;
/** How long a found token is used before asking again (it may have been rotated or signed out). */
const FOUND_TTL_MS = 10 * 60_000;
/** How long "no token" stands before looking again, e.g. after `gh auth login`. */
const MISSING_TTL_MS = 60_000;
/** Holds the token for the helper below; git passes its environment on to helpers. */
const TOKEN_ENV = "LOADOUT_GITHUB_TOKEN";
/** User name sent with a token. Git hosts accept any non-empty name next to a personal token. */
export const TOKEN_USER = "x-access-token";
/** Only answers `get`, so a rejected token is never "erased" from anywhere. */
const HELPER = `!f() { test "$1" = get && echo username=${TOKEN_USER} && echo "password=$${TOKEN_ENV}"; }; f`;
const HELPER_KEY = "credential.https://github.com.helper";
/** A token is one line of printable ASCII; anything else is not handed to git. */
const TOKEN_SHAPE = /^[\x21-\x7e]{8,512}$/;

type Run = typeof exec;

interface Found {
  token: string;
  origin: GitHubSignInOrigin;
}

async function lookUp(env: EnvReader, run: Run): Promise<Found | null> {
  const vars = env();
  for (const name of ENV_NAMES) {
    const value = vars[name]?.trim();
    if (value && TOKEN_SHAPE.test(value)) return { token: value, origin: name };
  }
  // No PATH means a sandboxed environment (tests): the machine's own `gh` must not leak in.
  if (!vars.PATH && !vars.Path) return null;
  try {
    const result = await run(GH_BINARY, GH_ARGS, {
      env: { ...vars, GH_PROMPT_DISABLED: "1" },
      timeoutMs: GH_TIMEOUT_MS,
    });
    const token = result.stdout.trim();
    return result.code === 0 && TOKEN_SHAPE.test(token) ? { token, origin: "gh" } : null;
  } catch {
    // Not installed, not signed in or too slow: there is simply no token.
    return null;
  }
}

export function createGitHubSignIn(
  env: EnvReader,
  run: Run = exec,
  now: () => number = Date.now,
): GitHubSignIn {
  /** The last lookup, shared by every caller while it runs, and until it goes stale. */
  let last: {
    at: number;
    result: Promise<Found | null>;
    settled: Found | null | undefined;
  } | null = null;
  const get = (): Promise<Found | null> => {
    if (last) {
      const ttl = last.settled === null ? MISSING_TTL_MS : FOUND_TTL_MS;
      if (last.settled === undefined || now() - last.at < ttl) return last.result;
    }
    const entry: NonNullable<typeof last> = {
      at: now(),
      result: lookUp(env, run),
      settled: undefined,
    };
    entry.result = entry.result.then((found) => {
      entry.settled = found;
      entry.at = now();
      return found;
    });
    last = entry;
    return entry.result;
  };

  return {
    origin: async () => (await get())?.origin ?? null,
    gitEnvironment: async (base = {}): Promise<Record<string, string>> => {
      const token = (await get())?.token;
      if (!token) return {};
      const index = Number.parseInt(base.GIT_CONFIG_COUNT ?? "", 10) || 0;
      return {
        [TOKEN_ENV]: token,
        GIT_CONFIG_COUNT: String(index + 1),
        [`GIT_CONFIG_KEY_${index}`]: HELPER_KEY,
        [`GIT_CONFIG_VALUE_${index}`]: HELPER,
      };
    },
  };
}
