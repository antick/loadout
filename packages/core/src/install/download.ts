import { setTimeout as sleep } from "node:timers/promises";

import { APP_SLUG, formatBytes, redactUrl } from "@loadout/shared";

import { AppError, cancelled, errorMessage, invalid, notFound } from "../errors";

export interface DownloadOptions {
  signal?: AbortSignal;
  /** Bytes received so far, and the total when the server announced it. */
  onProgress?: (received: number, total: number | null) => void;
  /** Refuse bodies larger than this. */
  maxBytes?: number;
  accept?: string;
  /** What the message of a 401/403/404 should say is missing, e.g. "The repository". */
  subject?: string;
  /** Address to name in messages when `url` is an internal one the user never typed. */
  label?: string;
  /**
   * Follow redirects one by one and report each new address. Without it redirects are followed
   * silently, which is all most downloads need.
   */
  onRedirect?: (to: string) => void;
  /** Give up after this long; defaults to five minutes. */
  timeoutMs?: number;
}

/** Fetch a URL into memory, with a size cap, a timeout, cancelling and progress. */
export type Download = (url: string, options?: DownloadOptions) => Promise<Buffer>;

export interface RequestOptions extends DownloadOptions {
  /** `GET` by default. Only a `GET` is asked again when the server is busy. */
  method?: string;
  body?: RequestInit["body"];
  headers?: Record<string, string>;
  /** Statuses the caller reads itself: handed back with their body instead of thrown. */
  answers?: (status: number) => boolean;
}

export interface HttpAnswer {
  status: number;
  body: Buffer;
}

/** A `Download` that can also send, and hands back the statuses its caller asks for. */
export type HttpRequest = (url: string, options?: RequestOptions) => Promise<HttpAnswer>;

const DOWNLOAD_TIMEOUT_MS = 300_000;
/** Big enough for any skill repository; small enough that a wrong link cannot fill the memory. */
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
/** Cap for an API answer or a listing page: generous, and still nothing like a repository. */
export const MAX_ANSWER_BYTES = 8 * 1024 * 1024;
const JSON_TYPE = "application/json";
const RETRIED_METHOD = "GET";
const TIMEOUT_ERROR = "TimeoutError";
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HIDDEN_STATUSES: ReadonlySet<number> = new Set([
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
]);
const DEFAULT_SUBJECT = "The file";
/** Answers that often mean "busy, ask again": GitLab sends 406 while it builds an archive. */
const RETRY_STATUSES: ReadonlySet<number> = new Set([406, 429, 502, 503, 504]);
const RETRY_DELAY_MS = 2000;
/** Hops followed when redirects are followed by hand; browsers stop at about the same. */
const MAX_REDIRECTS = 10;
const REDIRECT_MIN = 300;
const REDIRECT_MAX = 399;
/** Schemes of a web address; anything else is never fetched. */
export const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "http:"]);
/** Progress in whole percents goes up to this. */
export const PERCENT_TOTAL = 100;
/** How long an API call (a listing, a search, a detail) may take. */
export const API_TIMEOUT_MS = 15_000;

/** `input` as a URL, or null when it is not one. */
export function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

/** `onPercent` called once per whole percent, however often the same one comes in. */
export function eachPercentOnce(onPercent: (percent: number) => void): (percent: number) => void {
  let last = -1;
  return (percent) => {
    if (percent === last) return;
    last = percent;
    onPercent(percent);
  };
}

/**
 * Adapt a whole-percent listener to {@link DownloadOptions.onProgress}. Each percent is reported
 * once; nothing is reported while the size is unknown.
 */
export function percentReporter(
  onPercent?: (percent: number) => void,
): DownloadOptions["onProgress"] {
  if (!onPercent) return undefined;
  const report = eachPercentOnce(onPercent);
  return (received, total) => {
    if (total) report(Math.min(PERCENT_TOTAL, Math.floor((received / total) * PERCENT_TOTAL)));
  };
}

function contentLength(response: Response): number | null {
  const value = Number(response.headers.get("content-length"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function tooLarge(limit: number): AppError {
  return invalid(`The download is larger than ${formatBytes(limit)}`);
}

async function readBody(
  response: Response,
  limit: number,
  onProgress: DownloadOptions["onProgress"],
): Promise<Buffer> {
  const total = contentLength(response);
  if (total !== null && total > limit) throw tooLarge(limit);
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const chunks: Buffer[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(limit);
    }
    chunks.push(Buffer.from(value));
    onProgress?.(received, total);
  }
  return Buffer.concat(chunks);
}

/**
 * Drop a body that will not be read. Not awaited: cancelling one branch of a cloned body only
 * settles once every branch is cancelled, which may be never.
 */
function discard(response: Response): void {
  response.body?.cancel().catch(() => undefined);
}

function isRedirect(response: Response): boolean {
  return response.status >= REDIRECT_MIN && response.status <= REDIRECT_MAX;
}

/** Where a redirect points, resolved against the address that answered with it. */
function redirectTarget(response: Response, from: string, shown: string): string {
  const location = response.headers.get("location");
  if (!location) throw new AppError("NETWORK", `${shown} sent a redirect without an address`);
  const target = new URL(location, from);
  if (!WEB_PROTOCOLS.has(target.protocol)) {
    throw new AppError("NETWORK", `${shown} redirected to an address that is not http(s)`);
  }
  return target.toString();
}

/**
 * Requests through `fetchImpl`: the desktop app passes a proxy-aware one, the CLI the built-in
 * `fetch`. Errors are AppErrors with the URL's credentials removed.
 */
export function createRequest(fetchImpl: typeof fetch = fetch): HttpRequest {
  return async (url, options = {}) => {
    const { signal, onProgress, accept } = options;
    const method = options.method ?? RETRIED_METHOD;
    const limit = options.maxBytes ?? MAX_DOWNLOAD_BYTES;
    const shown = redactUrl(options.label ?? url);
    if (signal?.aborted) throw cancelled();
    const timeout = AbortSignal.timeout(options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const fetchOnce = (address: string): Promise<Response> =>
      fetchImpl(address, {
        method,
        body: options.body,
        headers: {
          "User-Agent": APP_SLUG,
          ...(accept ? { Accept: accept } : {}),
          ...options.headers,
        },
        redirect: options.onRedirect ? "manual" : "follow",
        signal: combined,
      });
    const request = async (): Promise<Response> => {
      if (!options.onRedirect) return fetchOnce(url);
      let address = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        const response = await fetchOnce(address);
        if (!isRedirect(response)) return response;
        discard(response);
        address = redirectTarget(response, address, shown);
        options.onRedirect(address);
      }
      throw new AppError("NETWORK", `${shown} redirected too many times`);
    };
    try {
      let response = await request();
      if (RETRY_STATUSES.has(response.status) && method === RETRIED_METHOD) {
        discard(response);
        await sleep(RETRY_DELAY_MS, undefined, { signal: combined });
        response = await request();
      }
      if (options.answers?.(response.status)) {
        return { status: response.status, body: await readBody(response, limit, onProgress) };
      }
      if (HIDDEN_STATUSES.has(response.status)) {
        // Hosts answer 404 for private repositories too, so never claim it does not exist.
        throw notFound(
          `${options.subject ?? DEFAULT_SUBJECT} at ${shown} was not found, or it is private.`,
        );
      }
      if (!response.ok) {
        throw new AppError("NETWORK", `${shown} answered with HTTP ${response.status}`);
      }
      return { status: response.status, body: await readBody(response, limit, onProgress) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal?.aborted) throw cancelled();
      // A fetch with its own deadline (a proxy-aware one) times out the same way.
      if (timeout.aborted || (error instanceof Error && error.name === TIMEOUT_ERROR)) {
        throw new AppError("TIMEOUT", `${shown} did not finish in time`);
      }
      throw new AppError("NETWORK", `Could not reach ${shown}: ${errorMessage(error)}`);
    }
  };
}

/** Downloads through `request`, for callers that only want the body. */
export function downloadWith(request: HttpRequest): Download {
  return async (url, options) => (await request(url, options)).body;
}

/** Options for an API call answered in JSON: that `Accept` and the JSON size cap. */
export function jsonOptions(options: RequestOptions = {}): RequestOptions {
  return { accept: JSON_TYPE, maxBytes: MAX_ANSWER_BYTES, ...options };
}

/** A JSON answer's value; null when `lenient` and it is not JSON, else a NETWORK error. */
export function readJson(body: Buffer, shown: string, lenient = false): unknown {
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    if (lenient) return null;
    throw new AppError("NETWORK", `The answer from ${redactUrl(shown)} could not be read`);
  }
}
