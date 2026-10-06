import { createHash } from "node:crypto";
import { readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import {
  GIT_DIR,
  lstatOrNull,
  readDirSafe,
  toPosix,
  isExecutableMode,
  GIT_IGNORE_FILE,
} from "./fs";
import { compareText } from "./text";

/** Entries that never count as skill content: not hashed, not diffed, not reported as removed. */
const IGNORED_NAMES: ReadonlySet<string> = new Set([
  GIT_DIR,
  ".DS_Store",
  "Thumbs.db",
  GIT_IGNORE_FILE,
  "__pycache__",
]);
const IGNORED_SUFFIX = ".pyc";
/** Folders whose plain hash `hashDirCached` remembers; the oldest looked at goes first. */
const HASH_CACHE_MAX = 5000;

export function isIgnoredContentName(name: string): boolean {
  return IGNORED_NAMES.has(name) || name.endsWith(IGNORED_SUFFIX);
}

/**
 * True when copying this folder into the library would leave something behind: a `.git` folder
 * or a link, anywhere inside. Its hash cannot see either, so equal hashes do not make it safe to
 * delete. `copiesLinks`: the copy keeps links, so only a `.git` folder is left behind.
 */
export function holdsUncopiedEntries(
  root: string,
  options: { copiesLinks?: boolean } = {},
): boolean {
  return readDirSafe(root).some((entry) => {
    if (entry.name === GIT_DIR || (!options.copiesLinks && entry.isSymbolicLink())) return true;
    return entry.isDirectory() && holdsUncopiedEntries(join(root, entry.name), options);
  });
}

/**
 * What `hashDir` does not see in a folder but someone may have put there on purpose: links (by
 * target) and `.gitignore` files (by content), by `/` separated path.
 */
function unhashedEntries(root: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readDirSafe(dir)) {
      if (entry.name === GIT_DIR) continue;
      const path = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) found.set(relativePath, `link:${linkText(path)}`);
      else if (entry.isDirectory()) walk(path, relativePath);
      else if (entry.name === GIT_IGNORE_FILE) found.set(relativePath, `file:${hashFile(path)}`);
    }
  };
  walk(root, "");
  return found;
}

function linkText(path: string): string {
  try {
    return readlinkSync(path);
  } catch {
    return "";
  }
}

/**
 * Two folders hold the same links and `.gitignore` files. With equal `hashDir` results they then
 * differ at most in caches and `.git` folders.
 */
export function sameUnhashedEntries(a: string, b: string): boolean {
  const ours = unhashedEntries(a);
  const theirs = unhashedEntries(b);
  return ours.size === theirs.size && [...ours].every(([path, what]) => theirs.get(path) === what);
}

export interface ContentFile {
  /** Path relative to the skill root, `/` separated. */
  relativePath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
  executable: boolean;
}

/**
 * Every regular file that counts as skill content, sorted by relative path. `skip` widens or
 * narrows that: a check of what gets copied passes `isNeverCopiedName`.
 */
export function listContentFiles(
  root: string,
  skip: (name: string) => boolean = isIgnoredContentName,
): ContentFile[] {
  const files: ContentFile[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readDirSafe(dir)) {
      if (skip(entry.name)) continue;
      const absolutePath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const stat = lstatOrNull(absolutePath);
        if (!stat) continue;
        files.push({
          relativePath: toPosix(relativePath),
          absolutePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          executable: isExecutableMode(stat.mode),
        });
      }
    }
  };
  walk(root, "");
  return files.sort((a, b) => compareText(a.relativePath, b.relativePath));
}

function frame(hash: ReturnType<typeof createHash>, bytes: Buffer | string): void {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(data.length));
  hash.update(length).update(data);
}

/** A NUL byte is the usual sign of a binary file. */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

export interface HashOptions {
  /** Treat CRLF and LF as equal in text files. */
  ignoreLineEndings?: boolean;
  /** Leave the executable bit out: Windows never has it, so a hash shared across systems must. */
  ignoreExecutable?: boolean;
  /** Hash these files (by `/` separated relative path) as if they held this text instead. */
  overrides?: ReadonlyMap<string, string>;
}

/**
 * Stable hash of a skill folder: relative paths, file bytes and the executable bit, length framed.
 * Returns null for a missing or empty tree. The executable bit is framed even when ignored, as
 * "-", so an ignoring hash of a folder without one equals the plain hash.
 */
export function hashDir(root: string, options: HashOptions = {}): string | null {
  const files = listContentFiles(root);
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of files) {
    let bytes: Buffer;
    const override = options.overrides?.get(file.relativePath);
    try {
      bytes = override === undefined ? readFileSync(file.absolutePath) : Buffer.from(override);
    } catch {
      bytes = Buffer.alloc(0);
    }
    if (options.ignoreLineEndings && !looksBinary(bytes)) {
      bytes = Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
    }
    frame(hash, file.relativePath);
    frame(hash, bytes);
    frame(hash, file.executable && !options.ignoreExecutable ? "x" : "-");
  }
  return hash.digest("hex");
}

/**
 * A cheap stand-in for `hashDir`: the folder's path and every content file's path, size,
 * modification time and executable bit, from a stat walk without reading a byte. Equal
 * fingerprints mean the content is almost surely the same; null for an empty tree.
 */
export function contentFingerprint(root: string): string | null {
  return fingerprintOf(root, listContentFiles(root));
}

function fingerprintOf(root: string, files: readonly ContentFile[]): string | null {
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  frame(hash, root);
  for (const file of files) {
    frame(
      hash,
      `${file.relativePath}\0${file.size}\0${file.mtimeMs}\0${file.executable ? "x" : "-"}`,
    );
  }
  return hash.digest("hex");
}

const hashCache = new Map<string, { fingerprint: string; hash: string | null }>();

/**
 * `hashDir` with no options, reading the files only when the folder's `contentFingerprint`
 * changed since it was last hashed in this process. For folders looked at again and again
 * (agent and project skills on every list), where the plain hash is all that is needed.
 */
export function hashDirCached(root: string): string | null {
  return cachedHash(root, contentFingerprint(root));
}

function cachedHash(root: string, fingerprint: string | null): string | null {
  if (fingerprint === null) {
    hashCache.delete(root);
    return null;
  }
  const known = hashCache.get(root);
  // Taken out and put back, so the map's order runs from least to most recently used.
  hashCache.delete(root);
  const hash = known?.fingerprint === fingerprint ? known.hash : hashDir(root);
  hashCache.set(root, { fingerprint, hash });
  if (hashCache.size > HASH_CACHE_MAX) {
    const oldest = hashCache.keys().next().value;
    if (oldest !== undefined) hashCache.delete(oldest);
  }
  return hash;
}

/** Newest modification time among content files, or null for an empty tree. */
export function newestContentMtime(root: string): number | null {
  return newestOf(listContentFiles(root));
}

function newestOf(files: readonly ContentFile[]): number | null {
  if (files.length === 0) return null;
  return files.reduce((newest, file) => Math.max(newest, file.mtimeMs), 0);
}

/** `hashDirCached` and `newestContentMtime` together, from one walk of the folder. */
export function hashAndNewestCached(root: string): {
  hash: string | null;
  newestMtime: number | null;
} {
  const files = listContentFiles(root);
  return { hash: cachedHash(root, fingerprintOf(root, files)), newestMtime: newestOf(files) };
}

/** SHA-256 of one file's bytes, hex. */
export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Hex(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

/** SHA-256 of every content file, by `/` separated path. */
export function fileDigests(root: string): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const file of listContentFiles(root)) {
    try {
      digests[file.relativePath] = hashFile(file.absolutePath);
    } catch {
      // Unreadable now: it counts as changed later, which only ever asks more, never less.
    }
  }
  return digests;
}
