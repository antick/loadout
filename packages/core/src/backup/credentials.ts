import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, GITHUB_HOST, redactUrl } from "@loadout/shared";
import type { SecretStore } from "../context";
import { AppError, invalid } from "../errors";

/**
 * Remote URLs and the tokens that go with them.
 * A token is only ever held in the secret store and handed to git through its environment, so it
 * never reaches `.git/config`, a saved URL, a log line or a process argument list.
 */

const TOKEN_KEY_PREFIX = "backup.git.token:";
const USER_KEY_PREFIX = "backup.git.user:";
/**
 * A name alone before `@` is a token only when it looks like one: `https://pankaj@bitbucket.org/…`
 * is a user name (copied from the host's clone button), and sending it as a token fails every sync.
 */
const LONE_TOKEN_PATTERN = /^(?:gh[pousr]_|github_pat_|glpat-|glptt-)|^[A-Za-z0-9_-]{32,}$/;
/** User name sent with a token. Git hosts accept any non-empty name next to a personal token. */
const TOKEN_USER = "x-access-token";
const SHORTHAND_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const SCP_LIKE_PATTERN = /^[\w.-]+@([\w.-]+):.+$/;
const HTTP_PATTERN = /^https?:\/\//i;
const SSH_PATTERN = /^ssh:\/\//i;
const FILE_PATTERN = /^file:\/\//i;
const MASKED_CREDENTIALS = "***@";

export type RemoteKind = "http" | "ssh" | "local";

export interface ParsedRemote {
  kind: RemoteKind;
  /** Lower-cased host (with port) for http and ssh remotes. */
  host: string | null;
  /** True only for `https://`, the one transport a token is sent over. */
  secure: boolean;
  /** The URL with any embedded credentials removed. */
  cleanUrl: string;
  /** A local remote's folder as a path, whether it was given as one or as a `file://` URL. */
  path: string | null;
  /** Token that was embedded in the URL, if any. */
  token: string | null;
  /** User name given with that token (`user:token@`); null to send the generic one. */
  user: string | null;
}

export function tokenKey(host: string): string {
  return `${TOKEN_KEY_PREFIX}${host.toLowerCase()}`;
}

function userKey(host: string): string {
  return `${USER_KEY_PREFIX}${host.toLowerCase()}`;
}

export const GITHUB_TOKEN_KEY = tokenKey(GITHUB_HOST);

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The folder a local remote names: a path as it is, a `file://` URL converted. */
function localPathOf(url: string): string {
  if (!FILE_PATTERN.test(url)) return url;
  try {
    return fileURLToPath(url);
  } catch {
    throw invalid("The remote address is not a valid URL.");
  }
}

/** Understand a remote the user typed. Throws INVALID_INPUT for anything git should not be given. */
export function parseRemoteUrl(input: string): ParsedRemote {
  const url = input.trim();
  if (!url) throw invalid("Enter the address of the Git remote.");
  // A leading dash would be read by git as an option, `ext::` style transports run programs.
  if (url.startsWith("-") || /^[a-z]+::/i.test(url)) {
    throw invalid(`That is not a Git remote address ${APP_NAME} can use.`);
  }

  if (HTTP_PATTERN.test(url)) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw invalid("The remote address is not a valid URL.");
    }
    const name = parsed.username ? decode(parsed.username) : null;
    const loneToken = !parsed.password && name !== null && LONE_TOKEN_PATTERN.test(name);
    const token = parsed.password ? decode(parsed.password) : loneToken ? name : null;
    const user = parsed.password ? name : null;
    parsed.password = "";
    // A plain user name stays in the address: it is not secret, and git needs it to log in.
    if (token) parsed.username = "";
    return {
      kind: "http",
      host: parsed.host.toLowerCase(),
      secure: parsed.protocol === "https:",
      cleanUrl: parsed.toString(),
      path: null,
      token,
      user,
    };
  }

  if (SSH_PATTERN.test(url)) {
    let host: string | null = null;
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      throw invalid("The remote address is not a valid URL.");
    }
    return { kind: "ssh", host, secure: false, cleanUrl: url, path: null, token: null, user: null };
  }

  const scp = SCP_LIKE_PATTERN.exec(url);
  if (scp?.[1]) {
    return {
      kind: "ssh",
      host: scp[1].toLowerCase(),
      secure: false,
      cleanUrl: url,
      path: null,
      token: null,
      user: null,
    };
  }

  if (FILE_PATTERN.test(url) || isAbsolute(url)) {
    return {
      kind: "local",
      host: null,
      secure: false,
      cleanUrl: url,
      path: localPathOf(url),
      token: null,
      user: null,
    };
  }

  if (SHORTHAND_PATTERN.test(url)) {
    const repo = url.endsWith(".git") ? url : `${url}.git`;
    return {
      kind: "http",
      host: GITHUB_HOST,
      secure: true,
      cleanUrl: `https://${GITHUB_HOST}/${repo}`,
      path: null,
      token: null,
      user: null,
    };
  }

  throw invalid(
    "Use an https:// or ssh:// address, git@host:owner/repo, owner/repo, or a folder path.",
  );
}

/**
 * Move a token embedded in the URL (`https://user:token@host/…`) into the secret store and return
 * the clean URL. Refuses when there is nowhere safe to keep the token.
 */
export async function sanitizeRemoteUrl(secrets: SecretStore, url: string): Promise<string> {
  const parsed = parseRemoteUrl(url);
  if (parsed.token && parsed.host) {
    if (!secrets.available()) {
      throw new AppError(
        "CREDENTIALS_UNAVAILABLE",
        "This address contains a token, but no secure credential store is available to keep it in. Remove the token from the address and use an SSH key or your own Git credential helper instead.",
      );
    }
    await secrets.set(tokenKey(parsed.host), parsed.token);
    if (parsed.user) await secrets.set(userKey(parsed.host), parsed.user);
    else await secrets.delete(userKey(parsed.host));
  }
  return parsed.cleanUrl;
}

/**
 * Environment that makes git send the stored token to this remote, and only to this remote.
 * Empty when there is no token: SSH keys and the user's own credential helper then apply.
 */
export async function authEnvironment(
  secrets: SecretStore,
  url: string | null,
): Promise<Record<string, string>> {
  if (!url || !secrets.available()) return {};
  let parsed: ParsedRemote;
  try {
    parsed = parseRemoteUrl(url);
  } catch {
    return {};
  }
  if (parsed.kind !== "http" || !parsed.secure || !parsed.host) return {};
  let token: string | null = null;
  let user: string | null = null;
  try {
    token = await secrets.get(tokenKey(parsed.host));
    user = await secrets.get(userKey(parsed.host));
  } catch {
    return {};
  }
  if (!token) return {};
  const basic = Buffer.from(`${user || TOKEN_USER}:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    // Scoped to the host so a redirect or another remote never receives the header.
    GIT_CONFIG_KEY_0: `http.https://${parsed.host}/.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

/** Hide `user:password@` in anything shown or logged, keeping a mark that there were some. */
export function maskUrlCredentials(text: string): string {
  return redactUrl(text, MASKED_CREDENTIALS);
}
