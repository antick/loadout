import { randomUUID } from "node:crypto";
import {
  API_TIMEOUT_MS,
  APP_NAME,
  APP_SLUG,
  type DeviceFlowPoll,
  type DeviceFlowStart,
  GITHUB_HOST,
  GITHUB_PUBLIC_CONFIRM_MS,
  type GithubAuthMethod,
  type GithubConnectResult,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
  REPO_NAME_PATTERN,
  isRecord,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, invalid, isUnanswered, notFound } from "../errors";
import {
  type HttpAnswer,
  type HttpRequest,
  JSON_TYPE,
  jsonOptions,
  readJson,
} from "../install/download";
import { INTERNAL_KEYS } from "../settings/store";
import { GITHUB_TOKEN_KEY } from "./credentials";

/**
 * GitHub sign-in and repository setup. The token goes from GitHub (or the user) straight into the
 * secret store; nothing in this file returns it, logs it or writes it anywhere else.
 */

const API_BASE = `https://api.${GITHUB_HOST}`;
const WEB_BASE = `https://${GITHUB_HOST}`;
const DEVICE_CODE_URL = `${WEB_BASE}/login/device/code`;
const ACCESS_TOKEN_URL = `${WEB_BASE}/login/oauth/access_token`;
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const OAUTH_SCOPE = "repo";
const API_ACCEPT = "application/vnd.github+json";
const API_VERSION = "2022-11-28";
const CLIENT_ID_ENV = `${APP_SLUG.toUpperCase()}_GITHUB_CLIENT_ID`;
const REPO_DESCRIPTION = `${APP_NAME} backup`;
const DEFAULT_EXPIRES_SECONDS = 900;
const DEFAULT_INTERVAL_SECONDS = 5;

const STATUS_OK = 200;
const STATUS_CREATED = 201;

export interface GithubDeps {
  /** Core's one HTTP client. */
  request: HttpRequest;
  /** Save the remote URL (and point `origin` at it when the library already is a repository). */
  saveRemote(url: string): Promise<void>;
}

export interface GithubService {
  connect(token: string, repoName: string, method: "pat" | "oauth"): Promise<GithubConnectResult>;
  /** Finish a connect that stopped at `GITHUB_REPO_PUBLIC`, now that the user agreed. */
  confirmPublic(confirmId: string): Promise<GithubConnectResult>;
  discardPublic(confirmId: string): void;
  deviceAvailable(): boolean;
  deviceStart(): Promise<DeviceFlowStart>;
  devicePoll(deviceCode: string, repoName: string): Promise<DeviceFlowPoll>;
  authMethod(): GithubAuthMethod;
}

/** A connect to a public repository, waiting in memory (never on disk) for the user's OK. */
interface PendingPublic {
  token: string;
  repoName: string;
  method: "pat" | "oauth";
  expiresAt: number;
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

/** Only a build that ships a client id offers device sign-in. */
const clientId = (): string => (process.env[CLIENT_ID_ENV] ?? "").trim();

export function createGithubService(ctx: CoreContext, deps: GithubDeps): GithubService {
  const pendingPublic = new Map<string, PendingPublic>();
  const prunePending = (now = Date.now()): void => {
    for (const [id, pending] of pendingPublic) {
      if (pending.expiresAt <= now) pendingPublic.delete(id);
    }
  };

  const send = deps.request;

  async function request(url: string, options: RequestOptions = {}): Promise<Reply> {
    const headers: Record<string, string> = { "User-Agent": APP_NAME };
    if (!options.form) headers["X-GitHub-Api-Version"] = API_VERSION;
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.json !== undefined) headers["Content-Type"] = "application/json";
    let answer: HttpAnswer;
    try {
      answer = await send(
        url,
        jsonOptions({
          method: options.method ?? "GET",
          accept: options.form ? JSON_TYPE : API_ACCEPT,
          headers,
          body: options.form
            ? new URLSearchParams(options.form)
            : options.json === undefined
              ? undefined
              : JSON.stringify(options.json),
          timeoutMs: API_TIMEOUT_MS,
          // Every status is read here: each one means something for the connect.
          answers: () => true,
        }),
      );
    } catch (error) {
      if (!isUnanswered(error)) throw error;
      throw new AppError(
        "NETWORK",
        "Could not reach GitHub. Check your internet connection, or connect with a personal access token instead.",
      );
    }
    // Some answers have no body; the status code carries the meaning.
    const body = readJson(answer.body, url, true);
    return {
      status: answer.status,
      body: Array.isArray(body) ? { items: body } : isRecord(body) ? body : {},
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
    allowPublic = false,
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
    if (user.status === HTTP_UNAUTHORIZED || user.status === HTTP_FORBIDDEN) {
      throw tokenInvalid();
    }
    const login = user.body.login;
    if (user.status !== STATUS_OK || typeof login !== "string") {
      throw unexpected("identify the account", user.status);
    }

    let repo = await request(`${API_BASE}/repos/${login}/${name}`, { token: cleanToken });
    let repoCreated = false;
    if (repo.status === HTTP_NOT_FOUND) {
      repo = await request(`${API_BASE}/user/repos`, {
        method: "POST",
        token: cleanToken,
        json: { name, private: true, description: REPO_DESCRIPTION, auto_init: false },
      });
      if (repo.status === HTTP_FORBIDDEN || repo.status === HTTP_NOT_FOUND) {
        throw scopeMissing();
      }
      if (repo.status !== STATUS_CREATED) throw unexpected("create the repository", repo.status);
      repoCreated = true;
    } else if (repo.status === HTTP_UNAUTHORIZED) {
      throw tokenInvalid();
    } else if (repo.status === HTTP_FORBIDDEN) {
      throw scopeMissing();
    } else if (repo.status !== STATUS_OK) {
      throw unexpected("open the repository", repo.status);
    }

    const fullName =
      typeof repo.body.full_name === "string" ? repo.body.full_name : `${login}/${name}`;
    // A public repository shows every backed-up skill, and its history, to anyone. Nothing is
    // saved until the user says so: no token, no remote, so no automatic backup can push there.
    if (!repoCreated && repo.body.private === false && !allowPublic) {
      prunePending();
      const confirmId = randomUUID();
      pendingPublic.set(confirmId, {
        token: cleanToken,
        repoName: name,
        method,
        expiresAt: Date.now() + GITHUB_PUBLIC_CONFIRM_MS,
      });
      throw new AppError(
        "GITHUB_REPO_PUBLIC",
        `${fullName} is public: anyone can see the skills you back up there, and their history. Nothing was saved yet.`,
        { repo: fullName, confirmId },
      );
    }

    const url = `${WEB_BASE}/${fullName}.git`;
    await ctx.secrets.set(GITHUB_TOKEN_KEY, cleanToken);
    await deps.saveRemote(url);
    ctx.settings.setRaw(INTERNAL_KEYS.githubAuthMethod, method);
    let hasContent: boolean;
    try {
      hasContent = repoCreated
        ? false
        : await remoteHasContent(cleanToken, fullName, repo.body.size);
    } finally {
      // Told only once this call is answered: the app refetches the backup state on it, which
      // closes the connect panel that waits for this answer to start the first backup.
      ctx.touched("backup");
    }
    return { url, login, repoCreated, remoteHasContent: hasContent };
  }

  return {
    connect,

    confirmPublic: async (confirmId) => {
      prunePending();
      const pending = pendingPublic.get(confirmId);
      pendingPublic.delete(confirmId);
      if (!pending) throw notFound("That connection waited too long. Connect to GitHub again.");
      return connect(pending.token, pending.repoName, pending.method, true);
    },

    discardPublic: (confirmId) => {
      pendingPublic.delete(confirmId);
    },

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
