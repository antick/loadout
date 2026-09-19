import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { AppError } from "./errors";

const WAIT_MS = 20_000;
const POLL_MS = 50;
/** A lock older than this whose process is gone is treated as abandoned. */
const STALE_MS = 10 * 60_000;

interface LockInfo {
  pid: number;
  host: string;
  operation: string;
  startedAt: number;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Cross-process lock shared by the app and the CLI so they never write the library at once.
 * Re-entrant inside one process. Never hold it across a network call.
 */
export class RepoLock {
  readonly #path: string;
  #depth = 0;
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
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = this.#readHolder();
      const abandoned =
        holder !== null &&
        holder.host === hostname() &&
        (!processAlive(holder.pid) || Date.now() - holder.startedAt > STALE_MS);
      if (abandoned) {
        try {
          unlinkSync(this.#path);
        } catch {
          // Someone else cleaned it up first.
        }
      }
      return false;
    }
  }

  #release(): void {
    try {
      unlinkSync(this.#path);
    } catch {
      // Already gone.
    }
  }

  /** Run `fn` holding the lock, waiting up to 20 s for another process to finish. */
  async run<T>(operation: string, fn: () => Promise<T> | T): Promise<T> {
    if (this.#depth > 0) return fn();
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
      this.#depth += 1;
      try {
        return await fn();
      } finally {
        this.#depth -= 1;
        this.#release();
      }
    });
    this.#queue = task.catch(() => undefined);
    return task;
  }

  /** Background work: take the lock only if it is free right now. Returns null when it was busy. */
  async tryRun<T>(operation: string, fn: () => Promise<T> | T): Promise<T | null> {
    if (this.#depth > 0) return fn();
    if (!this.#tryAcquire(operation)) return null;
    this.#depth += 1;
    try {
      return await fn();
    } finally {
      this.#depth -= 1;
      this.#release();
    }
  }
}
