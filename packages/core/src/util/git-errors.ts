import { type ErrorCode, redactUrl } from "@loadout/shared";
import { AppError } from "../errors";

/** How a failed git call is told apart, for every feature that runs git. */

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

/** The causes any git call can have; the rest only mean something to a sync. */
export const REMOTE_GIT_ERRORS: readonly GitErrorCode[] = ["NETWORK", "GIT_AUTH"];

/**
 * First match wins, so the specific causes come before the broad "conflict" rule: git's hints
 * for other failures can mention that word too.
 */
const ERROR_RULES: readonly (readonly [GitErrorCode, RegExp])[] = [
  [
    "NETWORK",
    /connection refused|could not resolve host|failed to connect|connection timed out|network is unreachable|unable to access .*(timed out|ssl|tls)/i,
  ],
  [
    "GIT_AUTH",
    /authentication failed|could not read (username|password)|terminal prompts disabled|permission denied \(publickey|permission to \S+ denied|invalid (username or password|credentials)|(http|returned error:) 40[13]\b/i,
  ],
  ["GIT_UNRELATED", /unrelated histories|refusing to merge/i],
  ["GIT_REJECTED", /\[rejected\]|non-fast-forward|fetch first|failed to push some refs/i],
  ["GIT_NO_UPSTREAM", /no upstream|has no upstream branch/i],
  ["SYNC_CONFLICT", /conflict/i],
  ["GIT_NOT_REPO", /not a git repository/i],
];

/** SSH chatter that would otherwise hide the real error line. */
const SSH_NOISE = /^(warning: permanently added|\*\* |debug\d:)/i;
const FATAL_PREFIX = /^(fatal|error):\s*/i;

/** The first rule `output` matches among `codes` (all of them by default), else `GIT`. */
export function classifyGitError(
  output: string,
  codes: readonly GitErrorCode[] = ERROR_RULES.map(([code]) => code),
): GitErrorCode {
  for (const [code, pattern] of ERROR_RULES) {
    if (codes.includes(code) && pattern.test(output)) return code;
  }
  return "GIT";
}

/** Git's output without blank lines and SSH chatter. */
export function gitOutputLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !SSH_NOISE.test(line));
}

function lastMeaningfulLine(output: string): string {
  const lines = gitOutputLines(output);
  const fatal = lines.filter((line) => FATAL_PREFIX.test(line));
  return (fatal.at(-1) ?? lines.at(-1) ?? "unknown error").replace(FATAL_PREFIX, "");
}

/** A failed git call that fetched from a repository: no network, no access, or anything else. */
export function gitFailure(action: string, stderr: string): AppError {
  const reason = redactUrl(lastMeaningfulLine(stderr));
  const code = classifyGitError(stderr, REMOTE_GIT_ERRORS);
  if (code === "NETWORK") {
    return new AppError(code, `${action}: ${reason}. Check your network connection.`);
  }
  if (code === "GIT_AUTH") {
    return new AppError(
      code,
      `${action}: authentication failed, or the repository does not exist (${reason}).`,
    );
  }
  return new AppError("GIT", `${action}: ${reason}`);
}
