import { randomUUID } from "node:crypto";

import { existsSync, renameSync, utimesSync } from "node:fs";

import { mkdtemp } from "node:fs/promises";

import { tmpdir } from "node:os";

import { join, relative } from "node:path";

import { APP_SLUG, type ErrorCode, MIB, normalizeSourceUrl, redactUrl } from "@loadout/shared";

import type { CoreContext } from "../context";

import { AppError, cancelled, invalid, isAppError } from "../errors";

import type { ExecResult } from "../util/exec";

import { GIT_TIMEOUT_MS, runGit } from "../util/git";

import { gitFailure } from "../util/git-errors";

import {
  GIT_DIR,
  copyDir,
  ensureDir,
  isDirectory,
  isInside,
  removePath,
  toPosix,
} from "../util/fs";

import {
  DEFAULT_REF,
  HEADS_PREFIX,
  TAGS_PREFIX,
  parseRefLines,
  pickRevision,
  refCandidates,
  refLists,
} from "./git-refs";

import { PARTIAL_MARK, createCloneCache } from "./clone-cache";
import { eachPercentOnce } from "./download";
import { type RemoteRefs, checkoutFolderName } from "./git-source";
import { MANIFEST_PATTERNS, applyWorkingTree, folderPattern } from "./git-sparse";

import { type FolderTrees, readFolderTrees } from "./git-trees";

export interface CheckoutOptions {
  /** Branch or tag; null means the remote's default branch. */
  branch?: string | null;
  /** Pin the working copy to this commit when the remote still serves it. */
  revision?: string | null;
  /**
   * Check out only the skill documents (`SKILL.md`). The caller lists or finds skills from them,
   * then calls `materialize` for the folders it really uses before reading any other file.
   */
  manifestsOnly?: boolean;
  signal?: AbortSignal;
  /** Download progress, 0–100, reported once per whole percent. */
  onPercent?: (percent: number) => void;
}

/** One file of a commit, as git records it: its path from the repository root, posix style. */
export interface TreeFile {
  path: string;
  executable: boolean;
}

/** A throwaway copy of a repository, without its `.git`. Always call `cleanup`. */
export interface Checkout {
  dir: string;
  /** Commit the files were taken from. */
  revision: string;
  /**
   * Every file of the commit, read from git without downloading it, while only the skill
   * documents are on disk (a `manifestsOnly` checkout Git could narrow); null for a whole
   * checkout, whose files are on disk to read.
   */
  files: readonly TreeFile[] | null;
  /**
   * Give these folders (inside `dir`) all their files, from the same commit. Does nothing for a
   * whole checkout. Call it before reading, copying or scanning anything in them.
   */
  materialize(dirs: readonly string[]): Promise<void>;
  cleanup(): Promise<void>;
}

/** What a checkout that is already whole says to `materialize`. */
export const WHOLE_CHECKOUT = {
  files: null,
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
  /** Tree ids of `paths` at exact commits, read without file contents (see `git-trees.ts`). */
  folderTrees(
    url: string,
    revisions: readonly string[],
    paths: readonly string[],
    options?: RemoteOptions,
  ): Promise<FolderTrees>;
  /** Empty the clone cache, leaving clones in use alone. Returns the bytes freed. */
  clearCache(): Promise<number>;
}

/**
 * Files bigger than this come later, only when a checkout needs them. Skill documents and text
 * arrive with the clone, so a typical skill repository is complete in one trip; big files
 * (images, PDFs, fonts, models) wait until a skill that holds them is installed. Measured on
 * GitHub: a 97 MB repository cloned in 2.4 s instead of 6.2 s. At 64 KB a 3.5 MB repository
 * needed a second trip for one long SKILL.md; at 256 KB it clones as fast as a full clone.
 */
const CLONE_FILTER = "--filter=blob:limit=256k";
const CACHE_LIMIT_BYTES = 1024 * MIB;
const REPOS_DIR_NAME = "repos";
/** Prefix of every temporary working copy we hand out. */
export const CLONE_DIR_PREFIX = `${APP_SLUG}-clone-`;

/** Failures where throwing the cache away and cloning again could not possibly help. */
const KEEP_CACHE_CODES: ReadonlySet<ErrorCode> = new Set([
  "CANCELLED",
  "TIMEOUT",
  "NETWORK",
  "GIT_MISSING",
  "GIT_AUTH",
]);
/** A branch or tag the repository does not have: a fresh clone would not find it either. */
const MISSING_REF = /couldn't find remote ref|remote branch \S+ not found/i;
const RECEIVING_PERCENT = /Receiving objects:\s+(\d+)%/;
/** Git's file modes in a tree: a file that can run, and a link (never copied, so never listed). */
const EXECUTABLE_MODE = "100755";
const SYMLINK_MODE = "120000";

/** Turn git's progress lines into whole percentages, each reported once. */
function percentReader(
  onPercent?: (percent: number) => void,
): ((line: string) => void) | undefined {
  if (!onPercent) return undefined;
  const report = eachPercentOnce(onPercent);
  return (line) => {
    const percent = Number(RECEIVING_PERCENT.exec(line)?.[1] ?? Number.NaN);
    if (!Number.isNaN(percent)) report(percent);
  };
}

function isHopeless(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (KEEP_CACHE_CODES.has(error.code) || MISSING_REF.test(error.message))
  );
}

/** System git with a shared clone cache. All network calls honour the proxy setting. */
export function createGitClient(ctx: CoreContext): GitClient {
  const reposDir = join(ctx.paths.cacheDir, REPOS_DIR_NAME);
  // A clone can take as long as git is given, so a second checkout of it waits that long.
  const cache = createCloneCache(reposDir, CACHE_LIMIT_BYTES, GIT_TIMEOUT_MS);

  async function run(
    args: string[],
    call: {
      network?: boolean;
      cwd?: string;
      signal?: AbortSignal;
      input?: string;
      onLine?: (l: string) => void;
    },
  ): Promise<ExecResult> {
    return runGit(args, {
      network: call.network ? { proxy: ctx.settings.proxy(), github: ctx.github } : undefined,
      cwd: call.cwd,
      signal: call.signal,
      input: call.input,
      onStderrLine: call.onLine,
    });
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

  /** Every regular file of `revision`, named from its tree: no file content is needed. */
  async function treeFiles(slot: string, revision: string): Promise<TreeFile[]> {
    const result = await runOk(
      "Failed to list the repository's files",
      ["ls-tree", "-r", "-z", "--full-tree", revision],
      { cwd: slot },
    );
    const files: TreeFile[] = [];
    for (const entry of result.stdout.split("\0")) {
      const tab = entry.indexOf("\t");
      const [mode, type] = entry.slice(0, tab).split(" ");
      if (tab === -1 || type !== "blob" || mode === SYMLINK_MODE) continue;
      files.push({ path: entry.slice(tab + 1), executable: mode === EXECUTABLE_MODE });
    }
    return files;
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
    const cloned = origin.stdout.trim();
    if (origin.code !== 0 || normalizeSourceUrl(cloned) !== normalizeSourceUrl(url)) {
      throw new AppError("GIT", "The cached clone belongs to a different repository.");
    }
    // The same repository spelled another way (ssh instead of https): fetch the way asked.
    if (cloned !== url) {
      await runOk("Failed to reuse the cached clone", ["config", "remote.origin.url", url], {
        cwd: slot,
      });
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
    if (existsSync(join(slot, GIT_DIR))) {
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
    await cache.prune(slot);
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
      // Git's own message can quote a URL a user rewrite (`insteadOf`) filled with a token.
      ctx.log.warn(`Checking out every file of ${redactUrl(url)}: ${redactUrl(tree.failure)}`);
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
    clearCache: cache.clear,
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

    folderTrees: (url, revisions, paths, remote = {}) =>
      readFolderTrees(run, CLONE_DIR_PREFIX, url, revisions, paths, remote.signal),

    listRefs: async (url, remote = {}) => {
      const result = await runOk(
        `Failed to reach ${redactUrl(url)}`,
        ["ls-remote", "--heads", "--tags", "--", url],
        { network: true, signal: remote.signal },
      );
      return refLists(parseRefLines(result.stdout));
    },

    checkout: async (url, checkoutOptions = {}) => {
      const slot = cache.slotFor(url);
      const { dir, revision, files, cleanup } = await cache.withSlot(slot, async () => {
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
        const target = join(parent, checkoutFolderName(url));
        const remove = (): Promise<void> => removePath(parent).catch(() => undefined);
        try {
          await copyDir(slot, target, { skipSymlinks: true });
          if (!isDirectory(target)) ensureDir(target);
          if (checkoutOptions.signal?.aborted) throw cancelled();
        } catch (error) {
          await remove();
          throw error;
        }
        // What is not on disk yet can still be named, from the commit's tree.
        const named = tree.partial ? await treeFiles(slot, pinned) : null;
        return {
          dir: target,
          revision: pinned,
          files: named,
          cleanup: remove,
        };
      });

      let whole = files === null;
      // A partial checkout comes back to its slot for the rest of its files, so the cache keeps
      // the slot until the checkout is whole or cleaned up.
      const release = whole ? (): void => undefined : cache.hold(slot);
      const materialize = async (wanted: readonly string[]): Promise<void> => {
        if (whole || wanted.length === 0) return;
        const folders = wanted.map((path) => {
          if (!isInside(dir, path)) throw invalid(`Not inside the checkout: ${path}`);
          return toPosix(relative(dir, path));
        });
        await cache.withSlot(slot, async () => {
          // The slot may be gone (the user deleted the cache folder): clone it again.
          if (!existsSync(join(slot, GIT_DIR))) {
            await prepareSlot(slot, url, { branch: checkoutOptions.branch });
          }
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
          if (whole) release();
        });
      };
      return {
        dir,
        revision,
        files,
        materialize,
        cleanup: async () => {
          release();
          await cleanup();
        },
      };
    },
  };
}
