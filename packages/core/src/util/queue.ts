/**
 * Work that must not overlap per key: each call for a key starts once the one before it has
 * settled, whether it succeeded or not. Calls for different keys run side by side. A key with
 * nothing queued takes no memory.
 */
export class KeyedQueue<K = string> {
  readonly #tails = new Map<K, Promise<unknown>>();

  run<T>(key: K, work: () => Promise<T> | T): Promise<T> {
    // Tails never reject, so `work` runs whatever happened to the call before.
    const task = (this.#tails.get(key) ?? Promise.resolve()).then(work);
    const tail = task.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return task;
  }

  /** Something for `key` is queued or running in this process. */
  busy(key: K): boolean {
    return this.#tails.has(key);
  }
}

/** One queue for everything: each call starts once the one before it has settled. */
export interface SerialQueue {
  run<T>(work: () => Promise<T> | T): Promise<T>;
}

const ONLY_KEY = "all";

export function createSerialQueue(): SerialQueue {
  const queue = new KeyedQueue<typeof ONLY_KEY>();
  return { run: (work) => queue.run(ONLY_KEY, work) };
}
