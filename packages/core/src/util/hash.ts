import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lstatOrNull, readDirSafe, toPosix } from "./fs";

/** Entries that never count as skill content: not hashed, not diffed, not reported as removed. */
const IGNORED_NAMES: ReadonlySet<string> = new Set([
  ".git",
  ".DS_Store",
  "Thumbs.db",
  ".gitignore",
  "__pycache__",
]);
const IGNORED_SUFFIX = ".pyc";
const EXECUTABLE_BITS = 0o111;

export function isIgnoredContentName(name: string): boolean {
  return IGNORED_NAMES.has(name) || name.endsWith(IGNORED_SUFFIX);
}

export interface ContentFile {
  /** Path relative to the skill root, `/` separated. */
  relativePath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
  executable: boolean;
}

/** Every regular file that counts as skill content, sorted by relative path. */
export function listContentFiles(root: string): ContentFile[] {
  const files: ContentFile[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readDirSafe(dir)) {
      if (isIgnoredContentName(entry.name)) continue;
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
          executable: process.platform !== "win32" && (stat.mode & EXECUTABLE_BITS) !== 0,
        });
      }
    }
  };
  walk(root, "");
  return files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
}

function frame(hash: ReturnType<typeof createHash>, bytes: Buffer | string): void {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(data.length));
  hash.update(length).update(data);
}

function isProbablyText(bytes: Buffer): boolean {
  return !bytes.includes(0);
}

export interface HashOptions {
  /** Treat CRLF and LF as equal in text files. Used only as a tie-breaker. */
  ignoreLineEndings?: boolean;
}

/**
 * Stable hash of a skill folder: relative paths, file bytes and the executable bit, length framed.
 * Returns null for a missing or empty tree.
 */
export function hashDir(root: string, options: HashOptions = {}): string | null {
  const files = listContentFiles(root);
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(file.absolutePath);
    } catch {
      bytes = Buffer.alloc(0);
    }
    if (options.ignoreLineEndings && isProbablyText(bytes)) {
      bytes = Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
    }
    frame(hash, file.relativePath);
    frame(hash, bytes);
    frame(hash, file.executable ? "x" : "-");
  }
  return hash.digest("hex");
}

/** Newest modification time among content files, or null for an empty tree. */
export function newestContentMtime(root: string): number | null {
  const files = listContentFiles(root);
  if (files.length === 0) return null;
  return Math.max(...files.map((f) => f.mtimeMs));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
