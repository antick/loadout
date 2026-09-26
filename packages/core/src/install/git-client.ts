import { randomUUID } from "node:crypto";
import { existsSync, renameSync, utimesSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { APP_SLUG, type ErrorCode } from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, cancelled, invalid, isAppError } from "../errors";
import { type ExecResult, exec } from "../util/exec";
import { BYTE_EXACT_CONFIG, configFlags, proxyConfig } from "../util/git-config";
import {
  copyDir,
  dirSize,
  ensureDir,
  isDirectory,
  isInside,
  readDirSafe,
  removePath,
  statOrNull,
  toPosix,
} from "../util/fs";
import { sha256Hex } from "../util/hash";
import { trySanitizeSkillName } from "../util/names";
import {
  DEFAULT_REF,
  HEADS_PREFIX,
  TAGS_PREFIX,
  parseRefLines,
  pickRevision,
  refCandidates,
  refLists,
} from "./git-refs";
import { type RemoteRefs, normalizeRepoUrl, redactUrl, repoNameFromUrl } from "./git-source";
import { MANIFEST_PATTERNS, applyWorkingTree, folderPattern } from "./git-sparse";

export interface CheckoutOptions {
  /** Branch or tag; null means the remote's default branch. */
  branch?: string | null;
  /** Pin the working copy to this commit when the remote still serves it. */
  revision?: string | null;
  /** Folder the caller cares about. Accepted for narrow clones later; today the clone is whole. */
  subpath?: string | null;
  /**
   * Check out only the skill documents (`SKILL.md`). The caller lists or finds skills from them,
   * then calls `materialize` for the folders it really uses before reading any other file.
   */
  manifestsOnly?: boolean;
  signal?: AbortSignal;
  /** Download progress, 0–100, reported once per whole percent. */
  onPercent?: (percent: number) => void;
}

/** A throwaway copy of a repository, without its `.git`. Always call `cleanup`. */
export interface Checkout {
  dir: string;
  /** Commit the files were taken from. */
  revision: string;
  /** Only the skill documents are here so far (a `manifestsOnly` checkout Git could narrow). */
  partial: boolean;
  /**
   * Give these folders (inside `dir`) all their files, from the same commit. Does nothing for a
   * whole checkout. Call it before reading, copying or scanning anything in them.
   */
  materialize(dirs: readonly string[]): Promise<void>;
  cleanup(): Promise<void>;
}

/** What a checkout that is already whole says to `materialize`. */
export const WHOLE_CHECKOUT = {
  partial: false,
  materialize: async (): Promise<void> => undefined,
} as const;

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
  /** Empty the clone cache, leaving clones in use alone. Returns the bytes freed. */
  clearCache(): Promise<number>;
}

export interface GitClientOptions {
  /** Clone cache budget (tests shrink it). */
  cacheLimitBytes?: number;
  /** Tests only: the git executable to run, e.g. one that does not exist. */
  binary?: string;
}

const GIT = "git";
const GIT_TIMEOUT_MS = 300_000;
/**
 * Files bigger than this come later, only when a checkout needs them. Skill documents and text
 * arrive with the clone, so a typical skill repository is complete in one trip; big files
 * (images, PDFs, fonts, models) wait until a skill that holds them is installed. Measured on
 * GitHub: a 97 MB repository cloned in 2.4 s instead of 6.2 s. At 64 KB a 3.5 MB repository
 * needed a second trip for one long SKILL.md; at 256 KB it clones as fast as a full clone.
 */
const CLONE_FILTER = "--filter=blob:limit=256k";
const CACHE_LIMIT_BYTES = 1024 * 1024 * 1024;
const REPOS_DIR_NAME = "repos";
const SLOT_HEX_LENGTH = 16;
const PARTIAL_MARK = ".partial-";
const FALLBACK_REPO_NAME = "repository";
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
const RECEIVING_PERCENT = /Receiving objects:\s+(\d+)%/;

/** Turn git's progress lines into whole percentages, each reported once. */
function percentReader(
  onPercent?: (percent: number) => void,
): ((line: string) => void) | undefined {
  if (!onPercent) return undefined;
  let last = -1;
  return (line) => {
    const percent = Number(RECEIVING_PERCENT.exec(line)?.[1] ?? Number.NaN);
    if (Number.isNaN(percent) || percent === last) return;
    last = percent;
    onPercent(percent);
  };
}

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

/** System git with a shared clone cache. All network calls honour the proxy setting. */
export function createGitClient(ctx: CoreContext, config: GitClientOptions = {}): GitClient {
  const reposDir = join(ctx.paths.cacheDir, REPOS_DIR_NAME);
  const cacheLimit = config.cacheLimitBytes ?? CACHE_LIMIT_BYTES;
  const binary = config.binary ?? GIT;
  /** Tail of the work queued per slot. A slot present here is in use. */
  const queues = new Map<string, Promise<unknown>>();

  async function run(
    args: string[],
    call: { network?: boolean; cwd?: string; signal?: AbortSignal; onLine?: (l: string) => void },
  ): Promise<ExecResult> {
    const proxy = call.network ? ctx.settings.proxy() : null;
    // Config flags only count when they come before the subcommand.
    const flags = configFlags([...BYTE_EXACT_CONFIG, ...proxyConfig(proxy)]);
    try {
      return await exec(binary, [...flags, ...args], {
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

  async function clearCache(): Promise<number> {
    let freed = 0;
    for (const entry of readDirSafe(reposDir)) {
      const path = join(reposDir, entry.name);
      const owner = join(reposDir, entry.name.split(PARTIAL_MARK)[0] ?? "");
      if (queues.has(path) || queues.has(owner)) continue;
      const size = entry.isDirectory() ? dirSize(path) : (statOrNull(path)?.size ?? 0);
      await removePath(path);
      freed += size;
    }
    return freed;
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
      onLine: percentReader(options.onPercent),
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
        // Big files come later, only when a checkout needs them (see `git-sparse.ts`).
        [
          "clone",
          "--depth",
          "1",
          CLONE_FILTER,
          "--no-checkout",
          "--progress",
          ...branch,
          "--",
          url,
          partial,
        ],
        { network: true, signal: options.signal, onLine: percentReader(options.onPercent) },
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

  /** Put the wanted files of the slot on disk (all when `patterns` is null). */
  async function fillTree(
    slot: string,
    url: string,
    patterns: readonly string[] | null,
    signal?: AbortSignal,
  ): Promise<{ partial: boolean }> {
    const tree = await applyWorkingTree(run, slot, patterns, signal);
    if (tree.failure) {
      ctx.log.warn(`Checking out every file of ${redactUrl(url)}: ${tree.failure}`);
    }
    if (tree.reset.code !== 0) {
      throw gitFailure(`Failed to fetch the files of ${redactUrl(url)}`, tree.reset.stderr);
    }
    return { partial: tree.partial };
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
    clearCache,
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
      const candidates = refCandidates(remote.branch);
      const result = await runOk(
        `Failed to reach ${redactUrl(url)}`,
        ["ls-remote", "--", url, ...candidates],
        { network: true, signal: remote.signal },
      );
      return pickRevision(parseRefLines(result.stdout), candidates);
    },

    listRefs: async (url, remote = {}) => {
      const result = await runOk(
        `Failed to reach ${redactUrl(url)}`,
        ["ls-remote", "--heads", "--tags", "--", url],
        { network: true, signal: remote.signal },
      );
      return refLists(parseRefLines(result.stdout));
    },

    checkout: async (url, checkoutOptions = {}) => {
      const slot = slotFor(url);
      const { dir, revision, partial, cleanup } = await withSlot(slot, async () => {
        if (checkoutOptions.signal?.aborted) throw cancelled();
        await prepareSlot(slot, url, checkoutOptions);
        const pinned = await pinRevision(slot, url, checkoutOptions);
        const tree = await fillTree(
          slot,
          url,
          checkoutOptions.manifestsOnly ? MANIFEST_PATTERNS : null,
          checkoutOptions.signal,
        );
        // Folder mtime is the "last used" stamp the cache pruning sorts by.
        const now = new Date();
        utimesSync(slot, now, now);

        const parent = await mkdtemp(join(tmpdir(), CLONE_DIR_PREFIX));
        // Named after the repository so a skill at the repo root infers a sensible name.
        const target = join(
          parent,
          trySanitizeSkillName(repoNameFromUrl(url)) ?? FALLBACK_REPO_NAME,
        );
        const remove = (): Promise<void> => removePath(parent).catch(() => undefined);
        try {
          await copyDir(slot, target, { skipSymlinks: true });
          if (!isDirectory(target)) ensureDir(target);
          if (checkoutOptions.signal?.aborted) throw cancelled();
        } catch (error) {
          await remove();
          throw error;
        }
        return { dir: target, revision: pinned, partial: tree.partial, cleanup: remove };
      });

      let whole = !partial;
      const materialize = async (wanted: readonly string[]): Promise<void> => {
        if (whole || wanted.length === 0) return;
        const folders = wanted.map((path) => {
          if (!isInside(dir, path)) throw invalid(`Not inside the checkout: ${path}`);
          return toPosix(relative(dir, path));
        });
        await withSlot(slot, async () => {
          // Another checkout of this repository may have moved the cache on since.
          await pinRevision(slot, url, { revision });
          // The repository root is a skill: nothing less than every file will do.
          const patterns = folders.includes("")
            ? null
            : [...MANIFEST_PATTERNS, ...folders.map(folderPattern)];
          const tree = await fillTree(slot, url, patterns);
          if (!tree.partial) whole = true;
          for (const folder of whole ? [""] : folders) {
            const target = join(dir, folder);
            await removePath(target);
            await copyDir(join(slot, folder), target, { skipSymlinks: true });
          }
        });
      };
      return { dir, revision, partial, materialize, cleanup };
    },
  };
}
