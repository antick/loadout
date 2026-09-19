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
