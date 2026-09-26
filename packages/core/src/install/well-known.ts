import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AppError, invalid, isAppError, notFound } from "../errors";
import { resolveInside } from "../util/fs";
import { archiveSkillDir, unpackArchiveInto } from "./archive";
import type { Download } from "./download";

/**
 * Skills a website publishes at a well-known address (RFC 8615): `/.well-known/agent-skills/` or
 * the older `/.well-known/skills/`, each with an `index.json`. Two index formats exist: the
 * current one lists one artifact per skill (a `SKILL.md` or an archive) with a SHA-256 digest; the
 * older one lists every file of a skill folder.
 */

export interface WellKnownEntry {
  /** Folder name the site gives the skill; checked to be a safe slug. */
  name: string;
  description: string;
  /** Current format: the one file to download, and the digest it must match. */
  artifact: { type: "skill-md" | "archive"; url: string; digest: string } | null;
  /** Older format: files below {@link fileBase}, `SKILL.md` among them. */
  files: string[];
  fileBase: string | null;
}

export interface WellKnownIndex {
  indexUrl: string;
  entries: WellKnownEntry[];
}

const WELL_KNOWN_PATHS = [".well-known/agent-skills", ".well-known/skills"] as const;
const INDEX_FILE = "index.json";
const CURRENT_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
/** Hosts whose URLs are always repositories, never sites with an index. */
const REPOSITORY_HOSTS: ReadonlySet<string> = new Set([
  "github.com",
  "www.github.com",
  "gitlab.com",
  "huggingface.co",
]);
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "http:"]);
const GIT_SUFFIX = ".git";
const PROBE_TIMEOUT_MS = 10_000;
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_SKILL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 1000;
const MAX_DESCRIPTION = 1024;
const NAME_MAX = 64;
const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SKILL_FILE = "SKILL.md";
const JSON_ACCEPT = "application/json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

/** A web address that may be a site publishing skills, rather than a repository or a file. */
export function isSiteCandidate(input: string): boolean {
  const url = parseUrl(input);
  if (!url || !WEB_PROTOCOLS.has(url.protocol) || url.username || url.password) return false;
  if (REPOSITORY_HOSTS.has(url.hostname.toLowerCase())) return false;
  return !url.pathname.toLowerCase().replace(/\/+$/, "").endsWith(GIT_SUFFIX);
}

/** The address of a well-known index, as recorded on skills installed from one. */
export function isWellKnownIndexUrl(url: string | null): url is string {
  const parsed = url ? parseUrl(url) : null;
  if (!parsed) return false;
  const path = parsed.pathname;
  return (
    path.endsWith(`/${INDEX_FILE}`) && WELL_KNOWN_PATHS.some((known) => path.includes(`/${known}/`))
  );
}

function isSafeName(value: unknown): value is string {
  return typeof value === "string" && value.length <= NAME_MAX && SAFE_NAME.test(value);
}

function isSafeFilePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) {
    return false;
  }
  if (value.startsWith("/")) return false;
  return !value.split("/").some((segment) => segment === ".." || segment === ".");
}

function description(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= MAX_DESCRIPTION
    ? value
    : null;
}

function currentEntry(value: unknown, indexUrl: string): WellKnownEntry | null {
  if (!isRecord(value) || !isSafeName(value.name)) return null;
  const text = description(value.description);
  const { type, url, digest } = value;
  if (text === null || (type !== "skill-md" && type !== "archive")) return null;
  if (typeof url !== "string" || typeof digest !== "string" || !DIGEST.test(digest)) return null;
  let resolved: URL;
  try {
    resolved = new URL(url, indexUrl);
  } catch {
    return null;
  }
  if (!WEB_PROTOCOLS.has(resolved.protocol)) return null;
  return {
    name: value.name,
    description: text,
    artifact: { type, url: resolved.toString(), digest },
    files: [],
    fileBase: null,
  };
}

function olderEntry(value: unknown, indexUrl: string): WellKnownEntry | null {
  if (!isRecord(value) || !isSafeName(value.name)) return null;
  const text = description(value.description);
  const files = value.files;
  if (text === null || !Array.isArray(files) || files.length === 0) return null;
  if (files.length > MAX_FILES || !files.every(isSafeFilePath)) return null;
  if (!files.some((file) => file.toLowerCase() === SKILL_FILE.toLowerCase())) return null;
  return {
    name: value.name,
    description: text,
    artifact: null,
    files,
    fileBase: new URL(`${value.name}/`, indexUrl).toString(),
  };
}

/**
 * The entries of an index, or null when the JSON is not a skills index. Entries that break the
 * rules are left out of a current index; an older index is all or nothing, as publishers expect.
 */
export function parseWellKnownIndex(raw: unknown, indexUrl: string): WellKnownEntry[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.skills)) return null;
  if (raw.$schema === CURRENT_SCHEMA) {
    const entries = raw.skills.flatMap((entry) => currentEntry(entry, indexUrl) ?? []);
    return entries.length > 0 ? entries : null;
  }
  // An unknown schema may mean a new shape; guessing could install the wrong files.
  if (raw.$schema !== undefined) return null;
  const entries = raw.skills.map((entry) => olderEntry(entry, indexUrl));
  return entries.every((entry): entry is WellKnownEntry => entry !== null) && entries.length > 0
    ? entries
    : null;
}

/** Download and read one index; null when there is none at that address. */
export async function readWellKnownIndex(
  download: Download,
  indexUrl: string,
  signal?: AbortSignal,
): Promise<WellKnownEntry[] | null> {
  let data: Buffer;
  try {
    data = await download(indexUrl, {
      signal,
      accept: JSON_ACCEPT,
      maxBytes: MAX_INDEX_BYTES,
      timeoutMs: PROBE_TIMEOUT_MS,
      subject: "The skills index",
    });
  } catch (error) {
    if (isAppError(error, "CANCELLED")) throw error;
    return null;
  }
  try {
    return parseWellKnownIndex(JSON.parse(data.toString("utf8")), indexUrl);
  } catch {
    return null;
  }
}

interface Candidate {
  indexUrl: string;
  /** Found below the typed path rather than at the root of the site. */
  scoped: boolean;
}

function candidates(url: URL): Candidate[] {
  const origin = `${url.protocol}//${url.host}`;
  const path = url.pathname.replace(/\/+$/, "");
  if (isWellKnownIndexUrl(url.toString())) {
    return [{ indexUrl: `${origin}${url.pathname}`, scoped: path !== "" }];
  }
  return WELL_KNOWN_PATHS.flatMap((known) => {
    const atRoot: Candidate = { indexUrl: `${origin}/${known}/${INDEX_FILE}`, scoped: false };
    if (!path) return [atRoot];
    return [{ indexUrl: `${origin}${path}/${known}/${INDEX_FILE}`, scoped: true }, atRoot];
  });
}

/**
 * Find the index a site publishes, or null when it publishes none. A URL with a path only takes
 * the index below that path: falling back to the root would offer every skill of the site.
 */
export async function findWellKnownIndex(
  download: Download,
  input: string,
  signal?: AbortSignal,
): Promise<WellKnownIndex | null> {
  const url = parseUrl(input);
  if (!url) return null;
  const all = candidates(url);
  const wantsScope = all.some((candidate) => candidate.scoped);
  let rootFound = false;
  for (const candidate of all) {
    const entries = await readWellKnownIndex(download, candidate.indexUrl, signal);
    if (!entries) continue;
    if (candidate.scoped || !wantsScope) return { indexUrl: candidate.indexUrl, entries };
    rootFound = true;
  }
  if (rootFound) {
    const origin = `${url.protocol}//${url.host}`;
    throw notFound(
      `${origin} publishes skills, but none below ${url.pathname}. Paste ${origin} to see them all.`,
    );
  }
  return null;
}

export function sha256Digest(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function writeInside(root: string, relativePath: string, data: Buffer): void {
  const target = resolveInside(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}

/**
 * Download one skill of an index into `root` (created here) and return its folder. The current
 * format's artifact must match its digest, so a changed or tampered file is refused.
 */
export async function fetchWellKnownSkill(
  download: Download,
  entry: WellKnownEntry,
  root: string,
  signal?: AbortSignal,
): Promise<string> {
  mkdirSync(root, { recursive: true });
  const subject = `The skill ${entry.name}`;
  if (entry.artifact) {
    const { type, url, digest } = entry.artifact;
    const data = await download(url, {
      signal,
      subject,
      maxBytes: type === "archive" ? MAX_ARTIFACT_BYTES : MAX_SKILL_FILE_BYTES,
    });
    if (sha256Digest(data) !== digest) {
      throw new AppError(
        "INVALID_INPUT",
        `The download of ${entry.name} does not match the digest its site published`,
      );
    }
    if (type === "skill-md") {
      writeInside(root, SKILL_FILE, data);
      return root;
    }
    unpackArchiveInto(data, new URL(url).pathname, root);
    return archiveSkillDir(root);
  }
  const base = entry.fileBase;
  if (!base) throw invalid(`The index entry for ${entry.name} lists no files`);
  for (const file of entry.files) {
    const isDocument = file.toLowerCase() === SKILL_FILE.toLowerCase();
    try {
      const data = await download(new URL(file, base).toString(), {
        signal,
        subject,
        maxBytes: isDocument ? MAX_SKILL_FILE_BYTES : MAX_ARTIFACT_BYTES,
      });
      writeInside(root, isDocument ? SKILL_FILE : file, data);
    } catch (error) {
      // The document is the skill; a missing extra file is skipped, as other tools do.
      if (isDocument || isAppError(error, "CANCELLED")) throw error;
    }
  }
  return root;
}
