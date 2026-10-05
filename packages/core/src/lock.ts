import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { AppError } from "./errors";
import { statOrNull } from "./util/fs";

const WAIT_MS = 20_000;
const POLL_MS = 50;
/**
 * A lock file that cannot be read (a crash between creating and writing it) is treated as
 * abandoned once it is this old. A readable one is abandoned only when its process is gone.
 */
const UNREADABLE_STALE_MS = 60_000;

export interface RepoLockOptions {
  /** How long `run` waits for another process before giving up. */
  waitMs?: number;
  /** What the BUSY error says is busy. */
  subject?: string;
}

const DEFAULT_SUBJECT = "The skill library";

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
  readonly #waitMs: number;
  readonly #subject: string;
  /**
   * The hold a call chain runs in. Work the holder schedules (a timer, a promise left running)
   * carries it too, so it only counts while that hold is still the current one.
   */
  readonly #held = new AsyncLocalStorage<object>();
  /** The hold of this process right now; null when no call chain of it holds the lock. */
  #current: object | null = null;
  /** `startedAt` written into the file we created, to release only our own lock. */
  #ownStartedAt: number | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(path: string, options: RepoLockOptions = {}) {
    this.#path = path;
    this.#waitMs = options.waitMs ?? WAIT_MS;
    this.#subject = options.subject ?? DEFAULT_SUBJECT;
  }

  /** Another process holds the lock right now (a lock it left behind does not count). */
  heldElsewhere(): boolean {
    if (this.#current !== null || !statOrNull(this.#path)) return false;
    return !this.#abandoned(this.#readHolder());
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
      const stat = statOrNull(this.#path);
      return stat !== null && Date.now() - stat.mtimeMs > UNREADABLE_STALE_MS;
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

  /** This call chain is inside the hold in progress. */
  #inside(): boolean {
    const hold = this.#held.getStore();
    return hold !== undefined && hold === this.#current;
  }

  #enter(): object {
    const hold = {};
    this.#current = hold;
    return hold;
  }

  #leave(): void {
    this.#current = null;
    this.#release();
  }

  async #holding<T>(fn: () => Promise<T> | T): Promise<T> {
    const hold = this.#enter();
    try {
      return await this.#held.run(hold, fn);
    } finally {
      this.#leave();
    }
  }

  /** Run `fn` holding the lock, waiting (20 s unless set) for another process to finish. */
  async run<T>(operation: string, fn: () => Promise<T> | T): Promise<T> {
    if (this.#inside()) return fn();
    const task = this.#queue.then(async () => {
      const deadline = Date.now() + this.#waitMs;
      while (!this.#tryAcquire(operation)) {
        if (Date.now() > deadline) {
          const holder = this.#readHolder();
          throw new AppError(
            "BUSY",
            `${this.#subject} is busy: ${holder?.operation ?? "another operation"}`,
          );
        }
        await sleep(POLL_MS);
      }
      return this.#holding(fn);
    });
    this.#queue = task.catch(() => undefined);
    return task;
  }

  /**
   * Synchronous work at start-up: run `fn` holding the lock if it is free right now, else skip
   * it. True when it ran. Only for work that is safe to leave to the next start.
   */
  holdSync(operation: string, fn: () => void): boolean {
    if (this.#inside()) {
      fn();
      return true;
    }
    if (this.#current !== null || !this.#tryAcquire(operation)) return false;
    const hold = this.#enter();
    try {
      this.#held.run(hold, fn);
      return true;
    } finally {
      this.#leave();
    }
  }

  /** Background work: take the lock only if it is free right now. Returns null when it was busy. */
  async tryRun<T>(operation: string, fn: () => Promise<T> | T): Promise<T | null> {
    if (this.#inside()) return fn();
    if (this.#current !== null || !this.#tryAcquire(operation)) return null;
    return this.#holding(fn);
  }

  /**
   * Start `fn` as work of its own, not part of the operation holding the lock here: a lock it
   * asks for waits until that operation is done. For work the holder starts and does not wait on.
   */
  outside<T>(fn: () => T): T {
    return this.#held.exit(fn);
  }
}
