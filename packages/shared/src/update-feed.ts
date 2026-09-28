import { isNewerVersion } from "./version";

/**
 * `URL` is a global in Node and in browsers, the only places this runs; this package is compiled
 * without either's types. Only what the checks below read.
 */
interface ParsedUrl {
  origin: string;
  protocol: string;
  hostname: string;
}
declare const URL: new (url: string) => ParsedUrl;

/**
 * Which build of a release this copy of the app takes: platform and processor, and on Linux the
 * package kind. The release workflow writes the same keys (`apps/desktop/scripts/update-feed.mjs`).
 */
export type UpdateTarget =
  | "darwin-arm64"
  | "darwin-x64"
  | "win32-x64"
  | "win32-arm64"
  | "linux-x64-appimage"
  | "linux-arm64-appimage"
  | "linux-x64-deb"
  | "linux-arm64-deb";

export interface UpdateFeedFile {
  name: string;
  url: string;
  sha256: string;
  size: number;
}

/** The release file `latest.json`. */
export interface UpdateFeed {
  version: string;
  releaseUrl: string | null;
  files: Partial<Record<UpdateTarget, UpdateFeedFile>>;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FILE_NAME_PATTERN = /^[\w.-]+$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Downloads must come from where the feed came from: a feed cannot send the app to another
 * site. Plain HTTP is accepted only for a feed on this computer (a local test server).
 */
function isAllowedUrl(url: string, feedUrl: string): boolean {
  let file: ParsedUrl;
  let feed: ParsedUrl;
  try {
    file = new URL(url);
    feed = new URL(feedUrl);
  } catch {
    return false;
  }
  if (file.origin !== feed.origin) return false;
  return (
    file.protocol === "https:" || (file.protocol === "http:" && LOCAL_HOSTS.has(file.hostname))
  );
}

function parseFile(raw: unknown, feedUrl: string): UpdateFeedFile | null {
  if (!isRecord(raw)) return null;
  const { name, url, sha256, size } = raw;
  if (typeof name !== "string" || !FILE_NAME_PATTERN.test(name) || /^\.+$/.test(name)) return null;
  if (typeof url !== "string" || !isAllowedUrl(url, feedUrl)) return null;
  if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)) return null;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) return null;
  return { name, url, sha256, size };
}

/** Validate a downloaded feed. Entries that are malformed or point elsewhere are dropped. */
export function parseUpdateFeed(raw: unknown, feedUrl: string): UpdateFeed {
  if (!isRecord(raw) || typeof raw.version !== "string" || !VERSION_PATTERN.test(raw.version)) {
    throw new Error("The update feed has no valid version");
  }
  const files: Partial<Record<UpdateTarget, UpdateFeedFile>> = {};
  if (isRecord(raw.files)) {
    for (const [key, value] of Object.entries(raw.files)) {
      const file = parseFile(value, feedUrl);
      if (file) files[key as UpdateTarget] = file;
    }
  }
  const releaseUrl =
    typeof raw.releaseUrl === "string" && raw.releaseUrl.startsWith("https://")
      ? raw.releaseUrl
      : null;
  return { version: raw.version, releaseUrl, files };
}

/** True when the feed offers a later version than the running one. */
export function feedIsNewer(feed: UpdateFeed, currentVersion: string): boolean {
  return isNewerVersion(feed.version, currentVersion);
}
