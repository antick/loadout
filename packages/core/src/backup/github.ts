import {
  APP_NAME,
  APP_SLUG,
  type DeviceFlowPoll,
  type DeviceFlowStart,
  type GithubAuthMethod,
  type GithubConnectResult,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, invalid } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { GITHUB_TOKEN_KEY } from "./credentials";

/**
 * GitHub sign-in and repository setup. The token goes from GitHub (or the user) straight into the
 * secret store; nothing in this file returns it, logs it or writes it anywhere else.
 */

const API_BASE = "https://api.github.com";
const WEB_BASE = "https://github.com";
const DEVICE_CODE_URL = `${WEB_BASE}/login/device/code`;
const ACCESS_TOKEN_URL = `${WEB_BASE}/login/oauth/access_token`;
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const OAUTH_SCOPE = "repo";
const API_ACCEPT = "application/vnd.github+json";
const API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 15_000;
const CLIENT_ID_ENV = `${APP_SLUG.toUpperCase()}_GITHUB_CLIENT_ID`;
const REPO_DESCRIPTION = `${APP_NAME} backup`;
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const DEFAULT_EXPIRES_SECONDS = 900;
const DEFAULT_INTERVAL_SECONDS = 5;

const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;

export interface GithubDeps {
  fetchImpl?: typeof fetch;
  /** Save the remote URL (and point `origin` at it when the library already is a repository). */
  saveRemote(url: string): Promise<void>;
}

export interface GithubService {
  connect(token: string, repoName: string, method: "pat" | "oauth"): Promise<GithubConnectResult>;
  deviceAvailable(): boolean;
  deviceStart(): Promise<DeviceFlowStart>;
  devicePoll(deviceCode: string, repoName: string): Promise<DeviceFlowPoll>;
  authMethod(): GithubAuthMethod;
}

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

interface RequestOptions {
  method?: "GET" | "POST";
  token?: string;
  json?: unknown;
  form?: Record<string, string>;
}

function tokenInvalid(): AppError {
  return new AppError(
    "GITHUB_TOKEN_INVALID",
    "GitHub did not accept this token. Check that it was copied completely and has not expired.",
  );
}

function scopeMissing(): AppError {
  return new AppError(
    "GITHUB_SCOPE",
    'This token may not create or open the backup repository. Create one with the "repo" scope and try again.',
  );
}

function unexpected(what: string, status: number): AppError {
  return new AppError("NETWORK", `GitHub could not ${what} (status ${status}). Try again later.`);
}

export function createGithubService(ctx: CoreContext, deps: GithubDeps): GithubService {
  const clientId = (): string =>
    ctx.settings.get("githubClientId").trim() || (process.env[CLIENT_ID_ENV] ?? "").trim();

  async function request(url: string, options: RequestOptions = {}): Promise<Reply> {
    const send = deps.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      Accept: options.form ? "application/json" : API_ACCEPT,
      "User-Agent": APP_NAME,
    };
    if (!options.form) headers["X-GitHub-Api-Version"] = API_VERSION;
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.json !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await send(url, {
        method: options.method ?? "GET",
        headers,
        body: options.form
          ? new URLSearchParams(options.form)
          : options.json === undefined
            ? undefined
            : JSON.stringify(options.json),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AppError(
        "NETWORK",
        "Could not reach GitHub. Check your internet connection, or connect with a personal access token instead.",
      );
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Some answers have no body; the status code carries the meaning.
    }
    const record = typeof body === "object" && body !== null && !Array.isArray(body) ? body : {};
    return {
      status: response.status,
      body: Array.isArray(body) ? { items: body } : (record as Record<string, unknown>),
    };
  }

  async function remoteHasContent(
    token: string,
    fullName: string,
    size: unknown,
  ): Promise<boolean> {
    if (typeof size === "number" && size > 0) return true;
    // `size` lags behind pushes, so ask for a commit. An empty repository answers 409.
    const commits = await request(`${API_BASE}/repos/${fullName}/commits?per_page=1`, { token });
    return commits.status === STATUS_OK && Array.isArray(commits.body.items)
      ? commits.body.items.length > 0
      : false;
  }

  async function connect(
    token: string,
    repoName: string,
    method: "pat" | "oauth",
  ): Promise<GithubConnectResult> {
    const cleanToken = token.trim();
    const name = repoName.trim();
    if (!cleanToken) throw invalid("Enter a GitHub token.");
    if (!REPO_NAME_PATTERN.test(name) || name === "." || name === "..") {
      throw invalid("Repository names may use letters, digits, dots, dashes and underscores.");
    }
    // Checked first: without somewhere safe for the token nothing else should happen on GitHub.
    if (!ctx.secrets.available()) {
      throw new AppError(
        "CREDENTIALS_UNAVAILABLE",
        "No secure credential store is available on this computer, so the GitHub token cannot be kept. Use an SSH remote instead.",
      );
    }

    const user = await request(`${API_BASE}/user`, { token: cleanToken });
    if (user.status === STATUS_UNAUTHORIZED || user.status === STATUS_FORBIDDEN) {
      throw tokenInvalid();
    }
    const login = user.body.login;
    if (user.status !== STATUS_OK || typeof login !== "string") {
      throw unexpected("identify the account", user.status);
    }

    let repo = await request(`${API_BASE}/repos/${login}/${name}`, { token: cleanToken });
    let repoCreated = false;
    if (repo.status === STATUS_NOT_FOUND) {
      repo = await request(`${API_BASE}/user/repos`, {
        method: "POST",
        token: cleanToken,
        json: { name, private: true, description: REPO_DESCRIPTION, auto_init: false },
      });
      if (repo.status === STATUS_FORBIDDEN || repo.status === STATUS_NOT_FOUND) {
        throw scopeMissing();
      }
      if (repo.status !== STATUS_CREATED) throw unexpected("create the repository", repo.status);
      repoCreated = true;
    } else if (repo.status === STATUS_UNAUTHORIZED) {
      throw tokenInvalid();
    } else if (repo.status === STATUS_FORBIDDEN) {
      throw scopeMissing();
    } else if (repo.status !== STATUS_OK) {
      throw unexpected("open the repository", repo.status);
    }

    const fullName =
      typeof repo.body.full_name === "string" ? repo.body.full_name : `${login}/${name}`;
    const url = `${WEB_BASE}/${fullName}.git`;
    await ctx.secrets.set(GITHUB_TOKEN_KEY, cleanToken);
    await deps.saveRemote(url);
    ctx.settings.setRaw(INTERNAL_KEYS.githubAuthMethod, method);
    ctx.touched("backup");

    return {
      url,
      login,
      repoCreated,
      // A missing flag is read as private, so the "this repository is public" warning stays rare.
      repoPrivate: repo.body.private !== false,
      remoteHasContent: repoCreated
        ? false
        : await remoteHasContent(cleanToken, fullName, repo.body.size),
    };
  }

  return {
    connect,

    deviceAvailable: () => clientId() !== "",

    deviceStart: async () => {
      const id = clientId();
      if (!id) {
        throw new AppError(
          "GITHUB_NOT_CONFIGURED",
          "Signing in with GitHub is not set up in this build. Connect with a personal access token instead.",
        );
      }
      const reply = await request(DEVICE_CODE_URL, {
        method: "POST",
        form: { client_id: id, scope: OAUTH_SCOPE },
      });
      const { device_code, user_code, verification_uri, expires_in, interval } = reply.body;
      if (
        reply.status !== STATUS_OK ||
        typeof device_code !== "string" ||
        typeof user_code !== "string" ||
        typeof verification_uri !== "string"
      ) {
        throw unexpected("start the sign-in", reply.status);
      }
      return {
        deviceCode: device_code,
        userCode: user_code,
        verificationUri: verification_uri,
        expiresIn: typeof expires_in === "number" ? expires_in : DEFAULT_EXPIRES_SECONDS,
        interval: typeof interval === "number" ? interval : DEFAULT_INTERVAL_SECONDS,
      };
    },

    devicePoll: async (deviceCode, repoName) => {
      const id = clientId();
      if (!id) {
        throw new AppError("GITHUB_NOT_CONFIGURED", "Signing in with GitHub is not set up.");
      }
      const reply = await request(ACCESS_TOKEN_URL, {
        method: "POST",
        form: { client_id: id, device_code: deviceCode, grant_type: DEVICE_GRANT_TYPE },
      });
      const token = reply.body.access_token;
      if (typeof token === "string" && token) {
        return { status: "connected", result: await connect(token, repoName, "oauth") };
      }
      switch (reply.body.error) {
        case "authorization_pending":
          return { status: "pending", result: null };
        case "slow_down":
          return { status: "slow_down", result: null };
        case "expired_token":
          throw new AppError(
            "GITHUB_DEVICE_EXPIRED",
            "The sign-in code expired before it was used. Start the sign-in again.",
          );
        case "access_denied":
          throw new AppError("GITHUB_DEVICE_DENIED", "The sign-in was cancelled on GitHub.");
        default:
          throw unexpected("finish the sign-in", reply.status);
      }
    },

    authMethod: () => {
      const method = ctx.settings.getRaw<string | null>(INTERNAL_KEYS.githubAuthMethod, null);
      return method === "oauth" || method === "pat" ? method : null;
    },
  };
}
