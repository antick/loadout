import { redactUrl } from "@loadout/shared";
import { AppError } from "../errors";

/** How a failed git call is told apart: no network, no access, or anything else. */

const NETWORK_MARKERS = [
  "could not resolve host",
  "failed to connect",
  "connection refused",
  "connection timed out",
  "network is unreachable",
];
const AUTH_MARKERS = [
  "authentication failed",
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "permission denied (publickey",
  "invalid username or password",
  "invalid credentials",
];

/** SSH chatter that would otherwise hide the real error line. */
const NOISE = /^warning: permanently added/i;

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line && !NOISE.test(line));
  const fatal = lines.filter((line) => /^(fatal|error):/i.test(line));
  return (fatal.at(-1) ?? lines.at(-1) ?? "unknown error").replace(/^(fatal|error):\s*/i, "");
}

/** Turn a failed git call into the right error code. */
export function gitFailure(action: string, stderr: string): AppError {
  const text = stderr.toLowerCase();
  const reason = redactUrl(lastMeaningfulLine(stderr));
  if (NETWORK_MARKERS.some((marker) => text.includes(marker))) {
    return new AppError("NETWORK", `${action}: ${reason}. Check your network connection.`);
  }
  if (AUTH_MARKERS.some((marker) => text.includes(marker))) {
    return new AppError(
      "GIT_AUTH",
      `${action}: authentication failed, or the repository does not exist (${reason}).`,
    );
  }
  return new AppError("GIT", `${action}: ${reason}`);
}
