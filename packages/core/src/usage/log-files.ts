import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { STREAM_CHUNK_BYTES } from "@loadout/shared";

/** A session log and how big it is now. */
export interface LogFile {
  path: string;
  size: number;
  mtime: number;
}

const LOG_SUFFIX = ".jsonl";
/** Sessions sit a few folders down (`projects/<project>/<session>/subagents/…`). */
const MAX_DEPTH = 5;
const NEWLINE = 0x0a;

/** Every `.jsonl` file under `root`; none when it is missing. Links are not followed. */
export async function listLogFiles(root: string, depth = 0): Promise<LogFile[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: LogFile[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && depth < MAX_DEPTH) {
      files.push(...(await listLogFiles(path, depth + 1)));
    } else if (entry.isFile() && entry.name.endsWith(LOG_SUFFIX)) {
      const info = await stat(path).catch(() => null);
      if (info) files.push({ path, size: info.size, mtime: Math.trunc(info.mtimeMs) });
    }
  }
  return files;
}

/** Start and end (exclusive, before the newline) of every line in `buffer` holding a marker. */
function markedLines(buffer: Buffer, markers: readonly Buffer[]): [number, number][] {
  const starts = new Map<number, number>();
  for (const marker of markers) {
    let at = buffer.indexOf(marker);
    while (at !== -1) {
      const start = buffer.lastIndexOf(NEWLINE, at) + 1;
      const newline = buffer.indexOf(NEWLINE, at);
      const end = newline === -1 ? buffer.length : newline;
      starts.set(start, end);
      at = buffer.indexOf(marker, end);
    }
  }
  return [...starts.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Read `path` from byte `from` and hand every whole line holding one of `markers` to `onLine`, in
 * order. Lines without a marker are never decoded, so a large log costs little. A last line with
 * no newline yet is left for the next read. Returns the offset after the last whole line.
 */
export async function readMarkedLines(
  path: string,
  from: number,
  markers: readonly string[],
  onLine: (line: string) => void,
): Promise<number> {
  const needles = markers.map((marker) => Buffer.from(marker));
  const handle = await open(path, "r");
  try {
    let position = from;
    let readTo = from;
    let carry = Buffer.alloc(0);
    const chunk = Buffer.alloc(STREAM_CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, STREAM_CHUNK_BYTES, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const buffer =
        carry.length > 0
          ? Buffer.concat([carry, chunk.subarray(0, bytesRead)])
          : chunk.subarray(0, bytesRead);
      const lastNewline = buffer.lastIndexOf(NEWLINE);
      if (lastNewline === -1) {
        // A copy: `chunk` is reused for the next read.
        carry = Buffer.from(buffer);
        continue;
      }
      const whole = buffer.subarray(0, lastNewline + 1);
      for (const [start, end] of markedLines(whole, needles)) {
        onLine(whole.toString("utf8", start, end));
      }
      readTo += whole.length;
      carry = Buffer.from(buffer.subarray(lastNewline + 1));
    }
    return readTo;
  } finally {
    await handle.close();
  }
}
