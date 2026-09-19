import { isAbsolute } from "node:path";
import { APP_NAME } from "@skillboard/shared";
import type { SecretStore } from "../context";
import { AppError, invalid } from "../errors";

/**
 * Remote URLs and the tokens that go with them.
 * A token is only ever held in the secret store and handed to git through its environment, so it
 * never reaches `.git/config`, a saved URL, a log line or a process argument list.
 */

const TOKEN_KEY_PREFIX = "backup.git.token:";
const GITHUB_HOST = "github.com";
/** User name sent with a token. Git hosts accept any non-empty name next to a personal token. */
const TOKEN_USER = "x-access-token";
const SHORTHAND_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const SCP_LIKE_PATTERN = /^[\w.-]+@([\w.-]+):.+$/;
const HTTP_PATTERN = /^https?:\/\//i;
const SSH_PATTERN = /^ssh:\/\//i;
const FILE_PATTERN = /^file:\/\//i;
const URL_CREDENTIALS_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;

export type RemoteKind = "http" | "ssh" | "local";

export interface ParsedRemote {
  kind: RemoteKind;
  /** Lower-cased host (with port) for http and ssh remotes. */
  host: string | null;
  /** True only for `https://` — the one transport a token is sent over. */
  secure: boolean;
  /** The URL with any embedded credentials removed. */
  cleanUrl: string;
  /** Token that was embedded in the URL, if any. */
  token: string | null;
}

export function tokenKey(host: string): string {
  return `${TOKEN_KEY_PREFIX}${host.toLowerCase()}`;
}

export const GITHUB_TOKEN_KEY = tokenKey(GITHUB_HOST);

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
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
    const token = parsed.password
      ? decode(parsed.password)
      : parsed.username
        ? decode(parsed.username)
        : null;
    parsed.username = "";
    parsed.password = "";
    return {
      kind: "http",
      host: parsed.host.toLowerCase(),
      secure: parsed.protocol === "https:",
      cleanUrl: parsed.toString(),
      token,
    };
  }

  if (SSH_PATTERN.test(url)) {
    let host: string | null = null;
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      throw invalid("The remote address is not a valid URL.");
    }
    return { kind: "ssh", host, secure: false, cleanUrl: url, token: null };
  }

  const scp = SCP_LIKE_PATTERN.exec(url);
  if (scp?.[1]) {
    return { kind: "ssh", host: scp[1].toLowerCase(), secure: false, cleanUrl: url, token: null };
  }

  if (FILE_PATTERN.test(url) || isAbsolute(url)) {
    return { kind: "local", host: null, secure: false, cleanUrl: url, token: null };
  }

  if (SHORTHAND_PATTERN.test(url)) {
    const repo = url.endsWith(".git") ? url : `${url}.git`;
    return {
      kind: "http",
      host: GITHUB_HOST,
      secure: true,
      cleanUrl: `https://${GITHUB_HOST}/${repo}`,
      token: null,
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
  }
  return parsed.cleanUrl;
}

export async function deleteRemoteToken(secrets: SecretStore, url: string): Promise<void> {
  try {
    const parsed = parseRemoteUrl(url);
    if (parsed.host) await secrets.delete(tokenKey(parsed.host));
  } catch {
    // Nothing usable was stored for an address we cannot even parse.
  }
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
  try {
    token = await secrets.get(tokenKey(parsed.host));
  } catch {
    return {};
  }
  if (!token) return {};
  const basic = Buffer.from(`${TOKEN_USER}:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    // Scoped to the host so a redirect or another remote never receives the header.
    GIT_CONFIG_KEY_0: `http.https://${parsed.host}/.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

/** Hide `user:password@` in anything shown or logged. */
export function maskUrlCredentials(text: string): string {
  return text.replace(URL_CREDENTIALS_PATTERN, "$1***@");
}
