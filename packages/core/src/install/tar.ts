import { gunzipSync } from "node:zlib";
import { invalid } from "../errors";

/**
 * A minimal tar reader: regular files and folders only. Links are left out on purpose, the same as
 * for zip archives, because a link inside an archive could point anywhere.
 */

export interface TarEntry {
  /** Name as stored, before any safety checks. */
  name: string;
  kind: "file" | "directory";
  /** Unix permission bits. */
  mode: number;
  data: Buffer;
}

const BLOCK = 512;
const NAME_FIELD = { at: 0, length: 100 };
const MODE_FIELD = { at: 100, length: 8 };
const SIZE_FIELD = { at: 124, length: 12 };
const TYPE_AT = 156;
const MAGIC_FIELD = { at: 257, length: 6 };
const PREFIX_FIELD = { at: 345, length: 155 };
const USTAR = "ustar";
const OCTAL = 8;
/** Base-256 size, used by GNU tar for files over 8 GiB; far too big for a skill anyway. */
const BINARY_SIZE_FLAG = 0x80;

const TYPE_FILE = new Set(["0", "\0", "7"]);
const TYPE_DIRECTORY = "5";
const TYPE_GNU_LONG_NAME = "L";
const TYPE_PAX_HEADER = "x";
const PAX_PATH = "path";

const GZIP_MAGIC = [0x1f, 0x8b] as const;

export function isGzip(data: Buffer): boolean {
  return data[0] === GZIP_MAGIC[0] && data[1] === GZIP_MAGIC[1];
}

/** A tar stream, told by the `ustar` magic of its first header. */
export function isTar(data: Buffer): boolean {
  if (data.length < BLOCK) return false;
  return readText(data, MAGIC_FIELD.at, MAGIC_FIELD.length).startsWith(USTAR);
}

function readText(block: Buffer, at: number, length: number): string {
  const field = block.subarray(at, at + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function readOctal(block: Buffer, at: number, length: number): number {
  if (((block[at] ?? 0) & BINARY_SIZE_FLAG) !== 0) {
    throw invalid("The archive holds a file that is too large");
  }
  const text = readText(block, at, length).trim();
  if (!text) return 0;
  const value = Number.parseInt(text, OCTAL);
  if (!Number.isFinite(value) || value < 0) throw invalid("The archive is damaged");
  return value;
}

/** `path` from a PAX extended header (`<length> path=<value>\n` records). */
function paxPath(data: Buffer): string | null {
  let at = 0;
  let found: string | null = null;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(at, space).toString("utf8"), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = data.subarray(space + 1, at + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals !== -1 && record.slice(0, equals) === PAX_PATH) found = record.slice(equals + 1);
    at += length;
  }
  return found;
}

function isZeroBlock(block: Buffer): boolean {
  return block.every((byte) => byte === 0);
}

/**
 * Every file and folder of a `.tar` (gzipped or not). `maxBytes` caps the unpacked size, so a small
 * download cannot expand to fill the memory.
 */
/**
 * Most entries an archive may hold. Generous for a whole repository, but a pile of empty files
 * (which the byte cap alone never stops) cannot exhaust memory.
 */
export const MAX_ARCHIVE_ENTRIES = 100_000;

export function readTar(
  input: Buffer,
  maxBytes: number,
  maxEntries: number = MAX_ARCHIVE_ENTRIES,
): TarEntry[] {
  const data = isGzip(input) ? gunzipSync(input, { maxOutputLength: maxBytes + BLOCK * 4 }) : input;
  const entries: TarEntry[] = [];
  let at = 0;
  let longName: string | null = null;
  let total = 0;
  let headers = 0;
  while (at + BLOCK <= data.length) {
    const header = data.subarray(at, at + BLOCK);
    if (isZeroBlock(header)) break;
    headers += 1;
    if (headers > maxEntries) {
      throw invalid(`The archive holds more than ${maxEntries} entries`);
    }
    const size = readOctal(header, SIZE_FIELD.at, SIZE_FIELD.length);
    const type = String.fromCharCode(header[TYPE_AT] ?? 0);
    const bodyStart = at + BLOCK;
    const body = data.subarray(bodyStart, bodyStart + size);
    if (body.length < size) throw invalid("The archive is cut short");
    at = bodyStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === TYPE_GNU_LONG_NAME) {
      longName = readText(body, 0, body.length);
      continue;
    }
    if (type === TYPE_PAX_HEADER) {
      longName = paxPath(body) ?? longName;
      continue;
    }

    const prefix = readText(header, PREFIX_FIELD.at, PREFIX_FIELD.length);
    const shortName = readText(header, NAME_FIELD.at, NAME_FIELD.length);
    const name = longName ?? (prefix ? `${prefix}/${shortName}` : shortName);
    longName = null;
    const mode = readOctal(header, MODE_FIELD.at, MODE_FIELD.length);

    if (type === TYPE_DIRECTORY) {
      entries.push({ name, kind: "directory", mode, data: Buffer.alloc(0) });
    } else if (TYPE_FILE.has(type)) {
      total += size;
      if (total > maxBytes) throw invalid("The archive is too large when unpacked");
      entries.push({ name, kind: "file", mode, data: Buffer.from(body) });
    }
    // Links, devices and global headers are skipped.
  }
  return entries;
}
