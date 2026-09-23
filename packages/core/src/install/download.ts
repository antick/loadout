import { setTimeout as sleep } from "node:timers/promises";
import { APP_SLUG, formatBytes } from "@loadout/shared";
import { AppError, cancelled, errorMessage, invalid, notFound } from "../errors";
import { redactUrl } from "./git-source";

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
}

/** Fetch a URL into memory, with a size cap, a timeout, cancelling and progress. */
export type Download = (url: string, options?: DownloadOptions) => Promise<Buffer>;

const DOWNLOAD_TIMEOUT_MS = 300_000;
/** Big enough for any skill repository; small enough that a wrong link cannot fill the memory. */
export const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
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

const PERCENT_TOTAL = 100;

/**
 * Adapt a whole-percent listener to {@link DownloadOptions.onProgress}. Each percent is reported
 * once; nothing is reported while the size is unknown.
 */
export function percentReporter(
  onPercent?: (percent: number) => void,
): DownloadOptions["onProgress"] {
  if (!onPercent) return undefined;
  let last = -1;
  return (received, total) => {
    if (!total) return;
    const percent = Math.min(PERCENT_TOTAL, Math.floor((received / total) * PERCENT_TOTAL));
    if (percent === last) return;
    last = percent;
    onPercent(percent);
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
 * Downloads through `fetchImpl`: the desktop app passes a proxy-aware one, the CLI the built-in
 * `fetch`. Errors are AppErrors with the URL's credentials removed.
 */
export function createDownload(fetchImpl: typeof fetch = fetch): Download {
  return async (url, options = {}) => {
    const { signal, onProgress, accept } = options;
    const limit = options.maxBytes ?? MAX_DOWNLOAD_BYTES;
    const shown = redactUrl(options.label ?? url);
    if (signal?.aborted) throw cancelled();
    const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const request = (): Promise<Response> =>
      fetchImpl(url, {
        headers: { "User-Agent": APP_SLUG, ...(accept ? { Accept: accept } : {}) },
        redirect: "follow",
        signal: combined,
      });
    try {
      let response = await request();
      if (RETRY_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        await sleep(RETRY_DELAY_MS, undefined, { signal: combined });
        response = await request();
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
      return await readBody(response, limit, onProgress);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal?.aborted) throw cancelled();
      if (timeout.aborted) throw new AppError("TIMEOUT", `${shown} did not finish in time`);
      throw new AppError("NETWORK", `Could not download ${shown}: ${errorMessage(error)}`);
    }
  };
}
