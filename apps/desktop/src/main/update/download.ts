import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { UPDATE_DOWNLOAD_ATTEMPTS, UPDATE_STALL_MS } from "../constants";
import type { UpdateFeedFile } from "./feed";

export interface DownloadOptions {
  fetchImpl: typeof fetch;
  /** Cancels the whole download. What arrived so far is kept for the next try. */
  signal: AbortSignal;
  /** Called with the bytes received so far. */
  onProgress(received: number): void;
  /** No data for this long counts as a stalled connection. */
  stallMs?: number;
  /** Connections tried (each continuing where the last stopped) before giving up. */
  attempts?: number;
}

const STALLED = Symbol("stalled");

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * Settle with `promise`, or with STALLED after `ms`, or reject when `signal` aborts. A stalled
 * read is abandoned rather than awaited: a stuck stream does not always honour its abort signal.
 */
function within<T>(
  promise: Promise<T>,
  ms: number,
  signal: AbortSignal,
): Promise<T | typeof STALLED> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => resolve(STALLED)), ms);
    const onAbort = (): void => finish(() => reject(signal.reason));
    function finish(settle: () => void): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      settle();
    }
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

/** One connection: continue `partial` from its current size. "stalled" means try again. */
async function fetchInto(
  file: UpdateFeedFile,
  partial: string,
  options: DownloadOptions,
  stallMs: number,
): Promise<"done" | "stalled"> {
  let have = await sizeOf(partial);
  if (have > file.size) {
    await rm(partial, { force: true });
    have = 0;
  }
  if (have === file.size) return "done";

  const connection = new AbortController();
  const cancel = (): void => connection.abort(options.signal.reason);
  options.signal.addEventListener("abort", cancel, { once: true });
  try {
    const headers: Record<string, string> = have > 0 ? { Range: `bytes=${have}-` } : {};
    const response = await within(
      options.fetchImpl(file.url, { signal: connection.signal, headers }),
      stallMs,
      options.signal,
    );
    if (response === STALLED) return "stalled";
    if (!response.ok || !response.body) throw new Error(`The download failed (${response.status})`);

    // A server that ignores the range sends the whole file again: start over.
    const resume = have > 0 && response.status === 206;
    let received = resume ? have : 0;
    const out = createWriteStream(partial, { flags: resume ? "a" : "w" });
    const reader = response.body.getReader();
    let tooLarge = false;
    try {
      for (;;) {
        const next = await within(reader.read(), stallMs, options.signal);
        if (next === STALLED) {
          reader.cancel().catch(() => undefined);
          return "stalled";
        }
        // A connection the server closed early is continued like a stalled one.
        if (next.done) return received === file.size ? "done" : "stalled";
        received += next.value.byteLength;
        if (received > file.size) {
          tooLarge = true;
          throw new Error("The download is larger than the release says");
        }
        if (!out.write(next.value)) await once(out, "drain");
        options.onProgress(received);
      }
    } finally {
      out.end();
      await once(out, "close").catch(() => undefined);
      // Removed only once closed: Windows cannot delete a file that is still open.
      if (tooLarge) await rm(partial, { force: true });
    }
  } finally {
    options.signal.removeEventListener("abort", cancel);
    connection.abort();
  }
}

/**
 * Download a release file to `destination` and check it against the feed's size and SHA-256.
 * The file is written to `<destination>.part` and only renamed into place once it matches, so a
 * half-finished or corrupted download never looks ready. A connection that stalls is replaced by
 * one that continues where it stopped, and a cancelled or failed download continues next time.
 */
export async function downloadVerified(
  file: UpdateFeedFile,
  destination: string,
  options: DownloadOptions,
): Promise<void> {
  if ((await sizeOf(destination)) === file.size && (await sha256Of(destination)) === file.sha256) {
    return;
  }
  const partial = `${destination}.part`;
  const stallMs = options.stallMs ?? UPDATE_STALL_MS;
  const attempts = options.attempts ?? UPDATE_DOWNLOAD_ATTEMPTS;
  options.onProgress(await sizeOf(partial));
  for (let attempt = 1; ; attempt += 1) {
    options.signal.throwIfAborted();
    if ((await fetchInto(file, partial, options, stallMs)) === "done") break;
    if (attempt >= attempts) {
      throw new Error(
        "The connection keeps stalling. Try again later: the download continues where it stopped.",
      );
    }
  }

  if ((await sizeOf(partial)) !== file.size) {
    throw new Error(
      "The download stopped before it was complete. Try again: it continues where it stopped.",
    );
  }
  if ((await sha256Of(partial)) !== file.sha256) {
    await rm(partial, { force: true });
    throw new Error("The download does not match the release checksum");
  }
  await rename(partial, destination);
}
