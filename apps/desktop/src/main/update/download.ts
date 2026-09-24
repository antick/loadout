import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { once } from "node:events";
import type { UpdateFeedFile } from "./feed";

export interface DownloadOptions {
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  /** Called with the bytes received so far. */
  onProgress(received: number): void;
}

/**
 * Download a release file to `destination` and check it against the feed's size and SHA-256.
 * The file is written next to the destination first and only renamed into place once it matches,
 * so a half-finished or corrupted download never looks ready.
 */
export async function downloadVerified(
  file: UpdateFeedFile,
  destination: string,
  options: DownloadOptions,
): Promise<void> {
  const partial = `${destination}.part`;
  await rm(partial, { force: true });
  const response = await options.fetchImpl(file.url, { signal: options.signal });
  if (!response.ok || !response.body) {
    throw new Error(`The download failed (${response.status})`);
  }

  const hash = createHash("sha256");
  const out = createWriteStream(partial);
  let received = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > file.size) throw new Error("The download is larger than the release says");
      hash.update(value);
      if (!out.write(value)) await once(out, "drain");
      options.onProgress(received);
    }
    out.end();
    await once(out, "finish");
  } catch (error) {
    out.destroy();
    await rm(partial, { force: true });
    throw error;
  }

  if (received !== file.size) {
    await rm(partial, { force: true });
    throw new Error("The download stopped before it was complete");
  }
  if (hash.digest("hex") !== file.sha256) {
    await rm(partial, { force: true });
    throw new Error("The download does not match the release checksum");
  }
  await rename(partial, destination);
}
