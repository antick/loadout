import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { AppError } from "./errors";

const WAIT_MS = 20_000;
const POLL_MS = 50;
/**
 * A lock file that cannot be read (a crash between creating and writing it) is treated as
 * abandoned once it is this old. A readable one is abandoned only when its process is gone.
 */
const UNREADABLE_STALE_MS = 60_000;

interface LockInfo {
  pid: number;
  host: string;
  operation: string;
  startedAt: number;
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Cross-process lock shared by the app and the CLI so they never write the library at once.
 * Re-entrant for nested calls of the operation that holds it (tracked per async call chain), so
 * an unrelated call in the same process waits like any other. Never hold it across a network call.
 */
export class RepoLock {
  readonly #path: string;
  /** Set inside the call chain that holds the lock. */
  readonly #held = new AsyncLocalStorage<true>();
  /** Some call chain of this process holds the lock right now. */
  #active = false;
  /** `startedAt` written into the file we created, to release only our own lock. */
  #ownStartedAt: number | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  #readHolder(): LockInfo | null {
    try {
      return JSON.parse(readFileSync(this.#path, "utf8")) as LockInfo;
    } catch {
      return null;
    }
  }

  #abandoned(holder: LockInfo | null): boolean {
    if (holder === null) {
      try {
        return Date.now() - statSync(this.#path).mtimeMs > UNREADABLE_STALE_MS;
      } catch {
        return false;
      }
    }
    return holder.host === hostname() && holder.pid !== process.pid && !processAlive(holder.pid);
  }

  #tryAcquire(operation: string): boolean {
    try {
      const fd = openSync(this.#path, "wx");
      const info: LockInfo = {
        pid: process.pid,
        host: hostname(),
        operation,
        startedAt: Date.now(),
      };
      writeSync(fd, JSON.stringify(info));
      closeSync(fd);
      this.#ownStartedAt = info.startedAt;
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (this.#abandoned(this.#readHolder())) {
        try {
          unlinkSync(this.#path);
        } catch {
          // Someone else cleaned it up first.
        }
      }
      return false;
    }
  }

  /** Remove the file only while it is still ours: never another process's fresh lock. */
  #release(): void {
    const holder = this.#readHolder();
    const ours =
      holder !== null && holder.pid === process.pid && holder.startedAt === this.#ownStartedAt;
    this.#ownStartedAt = null;
    if (!ours) return;
    try {
      unlinkSync(this.#path);
    } catch {
      // Already gone.
    }
  }

  async #holding<T>(fn: () => Promise<T> | T): Promise<T> {
    this.#active = true;
    try {
      return await this.#held.run(true, fn);
    } finally {
      this.#active = false;
      this.#release();
    }
  }

  /** Run `fn` holding the lock, waiting up to 20 s for another process to finish. */
  async run<T>(operation: string, fn: () => Promise<T> | T): Promise<T> {
    if (this.#held.getStore()) return fn();
    const task = this.#queue.then(async () => {
      const deadline = Date.now() + WAIT_MS;
      while (!this.#tryAcquire(operation)) {
        if (Date.now() > deadline) {
          const holder = this.#readHolder();
          throw new AppError(
            "BUSY",
            `The skill library is busy: ${holder?.operation ?? "another operation"}`,
          );
        }
        await sleep(POLL_MS);
      }
      return this.#holding(fn);
    });
    this.#queue = task.catch(() => undefined);
    return task;
  }

  /** Background work: take the lock only if it is free right now. Returns null when it was busy. */
  async tryRun<T>(operation: string, fn: () => Promise<T> | T): Promise<T | null> {
    if (this.#held.getStore()) return fn();
    if (this.#active || !this.#tryAcquire(operation)) return null;
    return this.#holding(fn);
  }
}
