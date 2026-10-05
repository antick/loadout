import type { CoreContext } from "../context";
import { emitProgress } from "./preview-sessions";

/** A running operation that can be cancelled by key. Call `done` when it ends, however it ends. */
export interface CancelHandle {
  signal: AbortSignal;
  done(): void;
}

/**
 * Running installs and updates by caller-chosen key (repo URL, `<source>/<skillId>`,
 * `update:<skillId>`), so the UI can cancel what it started without holding a handle.
 */
export class CancelRegistry {
  // A set per key: the same repository can be previewed twice at once, and cancel stops both.
  readonly #running = new Map<string, Set<AbortController>>();

  register(key: string): CancelHandle {
    const controller = new AbortController();
    const group = this.#running.get(key) ?? new Set<AbortController>();
    group.add(controller);
    this.#running.set(key, group);
    return {
      signal: controller.signal,
      done: () => {
        group.delete(controller);
        if (group.size === 0 && this.#running.get(key) === group) this.#running.delete(key);
      },
    };
  }

  /** Returns whether anything was running under that key. */
  cancel(key: string): boolean {
    const group = this.#running.get(key);
    if (!group || group.size === 0) return false;
    for (const controller of group) controller.abort();
    return true;
  }
}

/** A running task as its body sees it. */
export interface Task {
  /** Progress and cancel key. */
  key: string;
  signal: AbortSignal;
  /**
   * Run `cleanup` when the task ends, however it ends. The returned function takes it back, for a
   * folder handed on to something that outlives the task.
   */
  keep(cleanup: () => Promise<void>): () => void;
}

/**
 * Run `body` as a task the UI can cancel under `key`. When it ends, kept cleanups run and the
 * status bar hears "done", with the name `doneName` reads from the result when it succeeded.
 */
export async function withTask<T>(
  ctx: CoreContext,
  cancels: CancelRegistry,
  key: string,
  body: (task: Task) => Promise<T>,
  doneName?: (result: T) => string,
): Promise<T> {
  const handle = cancels.register(key);
  const cleanups = new Set<() => Promise<void>>();
  let name: string | undefined;
  try {
    const result = await body({
      key,
      signal: handle.signal,
      keep: (cleanup) => {
        cleanups.add(cleanup);
        return () => cleanups.delete(cleanup);
      },
    });
    name = doneName?.(result);
    return result;
  } finally {
    for (const cleanup of cleanups) await cleanup();
    handle.done();
    emitProgress(ctx, key, "done", name ? { name } : {});
  }
}
