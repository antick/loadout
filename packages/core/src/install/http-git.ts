import { renameSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError, cancelled, isAppError } from "../errors";
import { ensureDir, readDirSafe, removePath } from "../util/fs";
import { trySanitizeSkillName } from "../util/names";
import { unpackArchive } from "./archive";
import type { Download } from "./download";
import {
  CLONE_DIR_PREFIX,
  type Checkout,
  type CheckoutOptions,
  type RemoteOptions,
} from "./git-client";
import { pickRevision, refCandidates, refLists } from "./git-refs";
import { type RemoteRefs, normalizeRepoUrl, redactUrl, repoNameFromUrl } from "./git-source";

/**
 * Git over plain HTTPS, for computers without Git. Refs come from the smart HTTP advertisement
 * every Git host serves; files come from the host's own archive download, which only GitHub and
 * GitLab offer in a known shape. Public repositories only: no credentials are ever sent.
 */
export interface HttpGit {
  /** The URL can be read without Git (any https remote, for refs). */
  canReadRefs(url: string): boolean;
  /** The files of this repository can be downloaded without Git. */
  canDownload(url: string): boolean;
  lsRemote(url: string, options?: RemoteOptions): Promise<string | null>;
  listRefs(url: string, options?: RemoteOptions): Promise<RemoteRefs>;
  checkout(url: string, options?: CheckoutOptions): Promise<Checkout>;
}

/** A host whose archive URL we know how to build. */
interface ArchiveHost {
  host: string;
  archiveUrl(path: string, repo: string, revision: string): string;
}

const ARCHIVE_HOSTS: readonly ArchiveHost[] = [
  {
    host: "github.com",
    archiveUrl: (path, _repo, revision) => `https://codeload.github.com/${path}/zip/${revision}`,
  },
  {
    host: "gitlab.com",
    archiveUrl: (path, repo, revision) =>
      `https://gitlab.com/${path}/-/archive/${revision}/${repo}-${revision}.zip`,
  },
];

const HTTPS = "https:";
const REFS_PATH = "/info/refs?service=git-upload-pack";
const ADVERTISEMENT_TYPE = "application/x-git-upload-pack-advertisement";
/** A ref advertisement is small; a huge one is not what we asked for. */
const MAX_ADVERTISEMENT_BYTES = 32 * 1024 * 1024;
const PKT_LENGTH_DIGITS = 4;
const HEX_RADIX = 16;
const ZERO_SHA = /^0+$/;
const SHA = /^[0-9a-f]{40,64}$/i;
const PERCENT_TOTAL = 100;
const FALLBACK_REPO_NAME = "repository";

/** `https://host/owner/repo(.git)` → host and the path without `.git`, or null. */
function parseHttpsRemote(url: string): { host: string; path: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  // Credentials in the URL mean a private repository: that is Git's job, not ours.
  if (parsed.protocol !== HTTPS || parsed.username || parsed.password) return null;
  const path = normalizeRepoUrl(parsed.pathname).replace(/^\/+/, "");
  if (path.split("/").filter(Boolean).length < 2) return null;
  return { host: parsed.host.toLowerCase(), path };
}

/** Parse the pkt-line ref advertisement of `git-upload-pack` (protocol v0/v1). */
export function parseAdvertisement(body: Buffer): Map<string, string> {
  const refs = new Map<string, string>();
  let at = 0;
  while (at + PKT_LENGTH_DIGITS <= body.length) {
    const length = Number.parseInt(body.toString("latin1", at, at + PKT_LENGTH_DIGITS), HEX_RADIX);
    if (Number.isNaN(length)) break;
    if (length === 0) {
      at += PKT_LENGTH_DIGITS;
      continue;
    }
    if (length < PKT_LENGTH_DIGITS || at + length > body.length) break;
    const line = body.toString("utf8", at + PKT_LENGTH_DIGITS, at + length);
    at += length;
    if (line.startsWith("#")) continue;
    // The first ref line carries the capabilities after a NUL.
    const [sha, ref] = (line.split("\0")[0] ?? "").trim().split(" ");
    if (sha && ref && SHA.test(sha) && !ZERO_SHA.test(sha)) refs.set(ref, sha);
  }
  return refs;
}

/** The one folder a host's archive wraps everything in; the root itself when there is none. */
function wrappedRoot(root: string): string {
  const entries = readDirSafe(root);
  const only = entries[0];
  return entries.length === 1 && only?.isDirectory() ? join(root, only.name) : root;
}

export function createHttpGit(download: Download): HttpGit {
  function archiveHost(url: string): { host: ArchiveHost; path: string } | null {
    const remote = parseHttpsRemote(url);
    const host = remote && ARCHIVE_HOSTS.find((entry) => entry.host === remote.host);
    return remote && host ? { host, path: remote.path } : null;
  }

  async function advertisedRefs(url: string, signal?: AbortSignal): Promise<Map<string, string>> {
    const remote = parseHttpsRemote(url);
    if (!remote) throw new AppError("GIT_MISSING", "Git is needed for this repository.");
    const body = await download(`https://${remote.host}/${remote.path}.git${REFS_PATH}`, {
      signal,
      accept: ADVERTISEMENT_TYPE,
      maxBytes: MAX_ADVERTISEMENT_BYTES,
      subject: "The repository",
      label: url,
    });
    const refs = parseAdvertisement(body);
    if (refs.size === 0) {
      throw new AppError("GIT", `${redactUrl(url)} did not list any branches`);
    }
    return refs;
  }

  async function lsRemote(url: string, options: RemoteOptions = {}): Promise<string | null> {
    const refs = await advertisedRefs(url, options.signal);
    return pickRevision(refs, refCandidates(options.branch));
  }

  return {
    canReadRefs: (url) => parseHttpsRemote(url) !== null,
    canDownload: (url) => archiveHost(url) !== null,
    lsRemote,
    listRefs: async (url, options = {}) => refLists(await advertisedRefs(url, options.signal)),

    checkout: async (url, options = {}) => {
      const target = archiveHost(url);
      if (!target) throw new AppError("GIT_MISSING", "Git is needed for this repository.");
      const wanted = options.revision?.trim();
      const revision =
        wanted && SHA.test(wanted)
          ? wanted
          : await lsRemote(url, { branch: options.branch, signal: options.signal });
      if (!revision) {
        const what = options.branch ? `'${options.branch}'` : "The default branch";
        throw new AppError("GIT", `${what} does not exist in ${redactUrl(url)}`);
      }
      const repo = repoNameFromUrl(url);
      let last = -1;
      const data = await download(target.host.archiveUrl(target.path, repo, revision), {
        signal: options.signal,
        subject: "The repository",
        label: url,
        onProgress: (received, total) => {
          if (!total || !options.onPercent) return;
          const percent = Math.min(PERCENT_TOTAL, Math.floor((received / total) * PERCENT_TOTAL));
          if (percent === last) return;
          last = percent;
          options.onPercent(percent);
        },
      });
      if (options.signal?.aborted) throw cancelled();

      const unpacked = await unpackArchive(data, repo);
      // Same shape as a git checkout: a temp parent holding one folder named after the repository.
      const parent = await mkdtemp(join(tmpdir(), CLONE_DIR_PREFIX));
      const cleanup = async (): Promise<void> => {
        await removePath(parent).catch(() => undefined);
      };
      try {
        const dir = join(parent, trySanitizeSkillName(repo) ?? FALLBACK_REPO_NAME);
        renameSync(wrappedRoot(unpacked.root), dir);
        ensureDir(dir);
        return { dir, revision, cleanup };
      } catch (error) {
        await cleanup();
        if (isAppError(error)) throw error;
        throw new AppError("IO", `Could not unpack ${redactUrl(url)}`);
      } finally {
        await unpacked.cleanup();
      }
    },
  };
}
