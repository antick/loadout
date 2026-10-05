import { join } from "node:path";
import { normalizeSourceUrl } from "@loadout/shared";
import { RepoLock } from "../lock";
import { dirSize, ensureDir, readDirSafe, removePath, statOrNull } from "../util/fs";
import { sha256Hex } from "../util/hash";

/**
 * The clone cache (`cache/repos`): one slot per repository, shared by the app and the CLI. A slot
 * is used by one checkout at a time, in this process and across processes, through a lock file
 * beside it. Pruning and clearing leave slots in use alone, wherever they are used, and slots an
 * open checkout still needs: a partial checkout comes back to its slot for the rest of its files.
 */

const SLOT_HEX_LENGTH = 16;
/** Marks a clone in progress next to its slot. */
export const PARTIAL_MARK = ".partial-";
const LOCK_SUFFIX = ".lock";
const LOCK_SUBJECT = "The clone cache";
const LOCK_OPERATION = "use a cached clone";

export interface CloneCache {
  /** The slot folder of a repository. */
  slotFor(url: string): string;
  /** Run `fn` with the slot to itself: no other checkout, here or in another process, uses it. */
  withSlot<T>(slot: string, fn: () => Promise<T>): Promise<T>;
  /** Keep the slot out of pruning and clearing until the returned release is called. */
  hold(slot: string): () => void;
  /** Drop least-recently-used slots until the cache fits its budget again; `keep` stays. */
  prune(keep: string): Promise<void>;
  /** Empty the cache, leaving slots in use alone. Returns the bytes freed. */
  clear(): Promise<number>;
}

export function createCloneCache(reposDir: string, limitBytes: number, waitMs: number): CloneCache {
  /** Tail of the work queued per slot. A slot present here is in use in this process. */
  const queues = new Map<string, Promise<unknown>>();
  const locks = new Map<string, RepoLock>();
  /** Open checkouts per slot that may still come back to it. */
  const held = new Map<string, number>();

  const lockOf = (slot: string): RepoLock => {
    let lock = locks.get(slot);
    if (!lock) {
      lock = new RepoLock(`${slot}${LOCK_SUFFIX}`, { waitMs, subject: LOCK_SUBJECT });
      locks.set(slot, lock);
    }
    return lock;
  };

  const inUse = (slot: string): boolean =>
    queues.has(slot) || held.has(slot) || lockOf(slot).heldElsewhere();

  /** The slot an entry of the cache folder belongs to, or null for a lock file. */
  const ownerOf = (name: string): string | null =>
    name.endsWith(LOCK_SUFFIX) ? null : join(reposDir, name.split(PARTIAL_MARK)[0] ?? "");

  return {
    slotFor: (url) => join(reposDir, sha256Hex(normalizeSourceUrl(url)).slice(0, SLOT_HEX_LENGTH)),

    withSlot: async (slot, fn) => {
      const previous = queues.get(slot) ?? Promise.resolve();
      const task = previous.then(() => {
        // The lock file sits beside the slot, so the cache folder must exist first.
        ensureDir(reposDir);
        return lockOf(slot).run(LOCK_OPERATION, fn);
      });
      const settled = task.catch(() => undefined);
      queues.set(slot, settled);
      try {
        return await task;
      } finally {
        if (queues.get(slot) === settled) queues.delete(slot);
      }
    },

    hold: (slot) => {
      held.set(slot, (held.get(slot) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const count = (held.get(slot) ?? 1) - 1;
        if (count > 0) held.set(slot, count);
        else held.delete(slot);
      };
    },

    prune: async (keep) => {
      const slots: { path: string; size: number; usedAt: number }[] = [];
      for (const entry of readDirSafe(reposDir)) {
        const path = join(reposDir, entry.name);
        const owner = ownerOf(entry.name);
        if (!entry.isDirectory() || !owner || path === keep || inUse(path)) continue;
        if (entry.name.includes(PARTIAL_MARK)) {
          // Leftover of an interrupted clone, unless the slot it belongs to is being cloned now.
          if (owner === keep || !inUse(owner)) await removePath(path);
          continue;
        }
        slots.push({ path, size: dirSize(path), usedAt: statOrNull(path)?.mtimeMs ?? 0 });
      }
      let total = slots.reduce((sum, slot) => sum + slot.size, 0);
      for (const slot of slots.sort((a, b) => a.usedAt - b.usedAt)) {
        if (total <= limitBytes) break;
        await removePath(slot.path);
        total -= slot.size;
      }
    },

    clear: async () => {
      let freed = 0;
      for (const entry of readDirSafe(reposDir)) {
        const path = join(reposDir, entry.name);
        const owner = ownerOf(entry.name);
        if (!owner || inUse(path) || inUse(owner)) continue;
        const size = entry.isDirectory() ? dirSize(path) : (statOrNull(path)?.size ?? 0);
        await removePath(path);
        freed += size;
      }
      return freed;
    },
  };
}
