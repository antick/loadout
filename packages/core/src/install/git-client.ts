import { randomUUID } from "node:crypto";
import { existsSync, renameSync, utimesSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_SLUG, type ErrorCode } from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, cancelled, isAppError } from "../errors";
import { type ExecResult, exec } from "../util/exec";
import {
  copyDir,
  dirSize,
  ensureDir,
  isDirectory,
  readDirSafe,
  removePath,
  statOrNull,
} from "../util/fs";
import { sha256Hex } from "../util/hash";
import { trySanitizeSkillName } from "../util/names";
import { type RemoteRefs, normalizeRepoUrl, redactUrl, repoNameFromUrl } from "./git-source";

export interface CheckoutOptions {
  /** Branch or tag; null means the remote's default branch. */
  branch?: string | null;
  /** Pin the working copy to this commit when the remote still serves it. */
  revision?: string | null;
  /** Folder the caller cares about. Accepted for narrow clones later; today the clone is whole. */
  subpath?: string | null;
  signal?: AbortSignal;
  /** Raw progress lines from git. */
  onProgress?: (line: string) => void;
}

/** A throwaway copy of a repository, without its `.git`. Always call `cleanup`. */
export interface Checkout {
  dir: string;
  /** Commit the files were taken from. */
  revision: string;
  cleanup(): Promise<void>;
}

export interface RemoteOptions {
  branch?: string | null;
  signal?: AbortSignal;
}

export interface GitClient {
  /** Installed git version, or null when git is missing. */
  gitVersion(): Promise<string | null>;
  /** Commit a branch or tag (or the default branch) points at upstream; null when it is gone. */
  lsRemote(url: string, options?: RemoteOptions): Promise<string | null>;
  listRefs(url: string, options?: RemoteOptions): Promise<RemoteRefs>;
  checkout(url: string, options?: CheckoutOptions): Promise<Checkout>;
}

export interface GitClientOptions {
  /** Clone cache budget (tests shrink it). */
  cacheLimitBytes?: number;
}

const GIT = "git";
const GIT_TIMEOUT_MS = 300_000;
const CACHE_LIMIT_BYTES = 1024 * 1024 * 1024;
const REPOS_DIR_NAME = "repos";
const SLOT_HEX_LENGTH = 16;
const PARTIAL_MARK = ".partial-";
const FALLBACK_REPO_NAME = "repository";
const DEFAULT_REF = "HEAD";
const PEELED_SUFFIX = "^{}";
const HEADS_PREFIX = "refs/heads/";
const TAGS_PREFIX = "refs/tags/";
/** Prefix of every temporary working copy we hand out. */
export const CLONE_DIR_PREFIX = `${APP_SLUG}-clone-`;

const NETWORK_MARKERS = [
  "could not resolve host",
  "failed to connect",
  "connection refused",
  "connection timed out",
  "network is unreachable",
];
const AUTH_MARKERS = [
  "authentication failed",
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "permission denied (publickey",
  "invalid username or password",
  "invalid credentials",
];
/** Failures where throwing the cache away and cloning again could not possibly help. */
const KEEP_CACHE_CODES: ReadonlySet<ErrorCode> = new Set([
  "CANCELLED",
  "TIMEOUT",
  "NETWORK",
  "GIT_MISSING",
]);
/** SSH chatter that would otherwise hide the real error line. */
const NOISE = /^warning: permanently added/i;

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line && !NOISE.test(line));
  const fatal = lines.filter((line) => /^(fatal|error):/i.test(line));
  return (fatal.at(-1) ?? lines.at(-1) ?? "unknown error").replace(/^(fatal|error):\s*/i, "");
}

/** Turn a failed git call into the right error code. */
export function gitFailure(action: string, stderr: string): AppError {
  const text = stderr.toLowerCase();
  const reason = redactUrl(lastMeaningfulLine(stderr));
  if (NETWORK_MARKERS.some((marker) => text.includes(marker))) {
    return new AppError("NETWORK", `${action}: ${reason}. Check your network connection.`);
  }
  if (AUTH_MARKERS.some((marker) => text.includes(marker))) {
    return new AppError(
      "GIT_AUTH",
      `${action}: authentication failed, or the repository does not exist (${reason}).`,
    );
  }
  return new AppError("GIT", `${action}: ${reason}`);
}

function isHopeless(error: unknown): boolean {
  return error instanceof AppError && KEEP_CACHE_CODES.has(error.code);
}

function parseRefLines(stdout: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha && ref) refs.set(ref, sha);
  }
  return refs;
}

/** System git with a shared clone cache. All network calls honour the proxy setting. */
export function createGitClient(ctx: CoreContext, config: GitClientOptions = {}): GitClient {
  const reposDir = join(ctx.paths.cacheDir, REPOS_DIR_NAME);
  const cacheLimit = config.cacheLimitBytes ?? CACHE_LIMIT_BYTES;
  /** Tail of the work queued per slot. A slot present here is in use. */
  const queues = new Map<string, Promise<unknown>>();

  async function run(
    args: string[],
    call: { network?: boolean; cwd?: string; signal?: AbortSignal; onLine?: (l: string) => void },
  ): Promise<ExecResult> {
    const proxy = call.network ? ctx.settings.proxy() : null;
    // Config flags only count when they come before the subcommand.
    const proxyFlags = proxy ? ["-c", `http.proxy=${proxy}`, "-c", `https.proxy=${proxy}`] : [];
    try {
      return await exec(GIT, [...proxyFlags, ...args], {
        cwd: call.cwd,
        // Never block on a credential prompt; keep messages in English so they can be classified.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
        timeoutMs: GIT_TIMEOUT_MS,
        signal: call.signal,
        onStderrLine: call.onLine,
      });
    } catch (error) {
      if (isAppError(error, "UNSUPPORTED")) {
        throw new AppError("GIT_MISSING", "Git is not installed or not on PATH.");
      }
      throw error;
    }
  }

  async function runOk(
    action: string,
    args: string[],
    call: Parameters<typeof run>[1],
  ): Promise<ExecResult> {
    const result = await run(args, call);
    if (result.code !== 0) throw gitFailure(action, result.stderr);
    return result;
  }

  function slotFor(url: string): string {
    return join(reposDir, sha256Hex(normalizeRepoUrl(url)).slice(0, SLOT_HEX_LENGTH));
  }

  /** One checkout per slot at a time inside this process. */
  async function withSlot<T>(slot: string, fn: () => Promise<T>): Promise<T> {
    const previous = queues.get(slot) ?? Promise.resolve();
    const task = previous.then(fn);
    const settled = task.catch(() => undefined);
    queues.set(slot, settled);
    try {
      return await task;
    } finally {
      if (queues.get(slot) === settled) queues.delete(slot);
    }
  }

  /** Drop least-recently-used slots until the cache fits its budget again. */
  async function prune(keep: string): Promise<void> {
    const slots: { path: string; size: number; usedAt: number }[] = [];
    for (const entry of readDirSafe(reposDir)) {
      const path = join(reposDir, entry.name);
      if (!entry.isDirectory() || path === keep || queues.has(path)) continue;
      if (entry.name.includes(PARTIAL_MARK)) {
        // Leftover of an interrupted clone, unless the slot it belongs to is being cloned now.
        const owner = join(reposDir, entry.name.split(PARTIAL_MARK)[0] ?? "");
        if (owner === keep || !queues.has(owner)) await removePath(path);
        continue;
      }
      slots.push({ path, size: dirSize(path), usedAt: statOrNull(path)?.mtimeMs ?? 0 });
    }
    let total = slots.reduce((sum, slot) => sum + slot.size, 0);
    for (const slot of slots.sort((a, b) => a.usedAt - b.usedAt)) {
      if (total <= cacheLimit) break;
      await removePath(slot.path);
      total -= slot.size;
    }
  }

  async function fetchInto(
    slot: string,
    ref: string,
    options: CheckoutOptions,
  ): Promise<ExecResult> {
    return run(["fetch", "--depth", "1", "--progress", "origin", ref], {
      network: true,
      cwd: slot,
      signal: options.signal,
      onLine: options.onProgress,
    });
  }

  /** Bring an existing slot to the wanted ref. Throws when the slot cannot be trusted. */
  async function refresh(slot: string, url: string, options: CheckoutOptions): Promise<void> {
    // The raw config value: `remote get-url` would apply the user's `insteadOf` rewrites and
    // never equal the URL we were given.
    const origin = await run(["config", "--get", "remote.origin.url"], { cwd: slot });
    if (origin.code !== 0 || normalizeRepoUrl(origin.stdout) !== normalizeRepoUrl(url)) {
      throw new AppError("GIT", "The cached clone belongs to a different repository.");
    }
    const action = `Failed to fetch ${redactUrl(url)}`;
    // Branch before tag, the same order `lsRemote` and `clone --branch` use.
    const refs = options.branch
      ? [`${HEADS_PREFIX}${options.branch}`, `${TAGS_PREFIX}${options.branch}`]
      : [DEFAULT_REF];
    let fetched: ExecResult | null = null;
    for (const ref of refs) {
      fetched = await fetchInto(slot, ref, options);
      if (fetched.code === 0) break;
    }
    if (!fetched || fetched.code !== 0) throw gitFailure(action, fetched?.stderr ?? "");
    await runOk(action, ["reset", "--hard", "FETCH_HEAD"], { cwd: slot });
    await runOk(action, ["clean", "-fdx"], { cwd: slot });
  }

  async function cloneFresh(slot: string, url: string, options: CheckoutOptions): Promise<void> {
    ensureDir(reposDir);
    // Clone next to the slot and rename, so an interrupted clone never looks like a usable slot.
    const partial = `${slot}${PARTIAL_MARK}${randomUUID()}`;
    const branch = options.branch ? ["--branch", options.branch] : [];
    try {
      await runOk(
        `Failed to clone ${redactUrl(url)}`,
        ["clone", "--depth", "1", "--progress", ...branch, "--", url, partial],
        { network: true, signal: options.signal, onLine: options.onProgress },
      );
      renameSync(partial, slot);
    } catch (error) {
      await removePath(partial);
      throw error;
    }
  }

  async function prepareSlot(slot: string, url: string, options: CheckoutOptions): Promise<void> {
    if (existsSync(join(slot, ".git"))) {
      try {
        await refresh(slot, url, options);
        return;
      } catch (error) {
        // Cancelling must not cost the user their cache; being offline must not either.
        if (isHopeless(error)) throw error;
        ctx.log.warn(`Clone cache for ${redactUrl(url)} could not be reused; cloning again`, error);
      }
    }
    await removePath(slot);
    await prune(slot);
    await cloneFresh(slot, url, options);
  }

  async function pinRevision(slot: string, url: string, options: CheckoutOptions): Promise<string> {
    const head = async (): Promise<string> =>
      (await runOk("Failed to read the clone", ["rev-parse", "HEAD"], { cwd: slot })).stdout.trim();
    const wanted = options.revision?.trim();
    const current = await head();
    if (!wanted || wanted === current) return current;
    const action = `Revision ${wanted} is no longer available from ${redactUrl(url)}`;
    const fetched = await fetchInto(slot, wanted, options);
    if (fetched.code !== 0) throw gitFailure(action, fetched.stderr);
    await runOk(action, ["reset", "--hard", "FETCH_HEAD"], { cwd: slot });
    return head();
  }

  return {
    gitVersion: async () => {
      try {
        const result = await run(["--version"], {});
        return /\d+(?:\.\d+)+/.exec(result.stdout)?.[0] ?? null;
      } catch (error) {
        if (isAppError(error, "GIT_MISSING")) return null;
        throw error;
      }
    },

    lsRemote: async (url, remote = {}) => {
      const branch = remote.branch?.trim();
      // Never "the first line": a branch beats a tag, and a peeled tag beats the tag object.
      const candidates = branch
        ? [
            `${HEADS_PREFIX}${branch}`,
            `${TAGS_PREFIX}${branch}${PEELED_SUFFIX}`,
            `${TAGS_PREFIX}${branch}`,
          ]
        : [DEFAULT_REF];
      const result = await runOk(
        `Failed to reach ${redactUrl(url)}`,
        ["ls-remote", "--", url, ...candidates],
        { network: true, signal: remote.signal },
      );
      const refs = parseRefLines(result.stdout);
      for (const candidate of candidates) {
        const sha = refs.get(candidate);
        if (sha) return sha;
      }
      return null;
    },

    listRefs: async (url, remote = {}) => {
      const result = await runOk(
        `Failed to reach ${redactUrl(url)}`,
        ["ls-remote", "--heads", "--tags", "--", url],
        { network: true, signal: remote.signal },
      );
      const names = [...parseRefLines(result.stdout).keys()].filter(
        (ref) => !ref.endsWith(PEELED_SUFFIX),
      );
      const under = (prefix: string): string[] =>
        names.filter((ref) => ref.startsWith(prefix)).map((ref) => ref.slice(prefix.length));
      return { branches: under(HEADS_PREFIX), tags: under(TAGS_PREFIX) };
    },

    checkout: async (url, checkoutOptions = {}) => {
      const slot = slotFor(url);
      return withSlot(slot, async () => {
        if (checkoutOptions.signal?.aborted) throw cancelled();
        await prepareSlot(slot, url, checkoutOptions);
        const revision = await pinRevision(slot, url, checkoutOptions);
        // Folder mtime is the "last used" stamp the cache pruning sorts by.
        const now = new Date();
        utimesSync(slot, now, now);

        const parent = await mkdtemp(join(tmpdir(), CLONE_DIR_PREFIX));
        // Named after the repository so a skill at the repo root infers a sensible name.
        const dir = join(parent, trySanitizeSkillName(repoNameFromUrl(url)) ?? FALLBACK_REPO_NAME);
        const cleanup = (): Promise<void> => removePath(parent).catch(() => undefined);
        try {
          await copyDir(slot, dir, { skipSymlinks: true });
          if (!isDirectory(dir)) ensureDir(dir);
          if (checkoutOptions.signal?.aborted) throw cancelled();
        } catch (error) {
          await cleanup();
          throw error;
        }
        return { dir, revision, cleanup };
      });
    },
  };
}
