import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  linkSync,
  openSync,
  renameSync,
  unlinkSync,
  utimesSync,
  writeSync,
} from "node:fs";
import { hostname, uptime } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { AppError } from "./errors";
import { statOrNull, readJsonOrNull } from "./util/fs";
import { createSerialQueue } from "./util/queue";

const WAIT_MS = 20_000;
const POLL_MS = 50;
/**
 * A lock file that cannot be read (a crash between creating and writing it) is treated as
 * abandoned once it is this old.
 */
const UNREADABLE_STALE_MS = 60_000;
/** While a lock is held, its file's modification time is moved on this often. */
const HEARTBEAT_MS = 5_000;
/**
 * A lock file not moved on for this long was left behind: its holder crashed, hangs, or sits on
 * a computer whose process this one cannot ask about (another host name, which on macOS also
 * happens when the network changes). Many heartbeats long, so a busy holder never loses it.
 */
const STALE_MS = 2 * 60_000;
const MS_PER_SECOND = 1000;

export interface RepoLockOptions {
  /** How long `run` waits for another process before giving up. */
  waitMs?: number;
  /** What the BUSY error says is busy. */
  subject?: string;
  /** Tests only: heartbeat and stale limit, instead of the constants above. */
  heartbeatMs?: number;
  staleMs?: number;
}

const DEFAULT_SUBJECT = "The skill library";

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

/** When this computer last started, in epoch ms. */
function bootTime(): number {
  return Date.now() - uptime() * MS_PER_SECOND;
}

/**
 * A process that wrote a record of itself (a pid in a file last written at `writtenAt`) is gone:
 * the record is older than this computer's start, so the pid may well belong to another program
 * now, or the process is not running. This process itself always counts as running.
 */
export function writerGone(pid: number, writtenAt: number): boolean {
  if (writtenAt < bootTime()) return true;
  return pid !== process.pid && !processAlive(pid);
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
  /** Calls of this process wait here for their turn before trying the file. */
  readonly #queue = createSerialQueue();
  readonly #heartbeatMs: number;
  readonly #staleMs: number;
  #heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(path: string, options: RepoLockOptions = {}) {
    this.#path = path;
    this.#waitMs = options.waitMs ?? WAIT_MS;
    this.#subject = options.subject ?? DEFAULT_SUBJECT;
    this.#heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.#staleMs = options.staleMs ?? STALE_MS;
  }

  /** Another process holds the lock right now (a lock it left behind does not count). */
  heldElsewhere(): boolean {
    if (this.#current !== null || !statOrNull(this.#path)) return false;
    return !this.#abandoned(this.#readHolder());
  }

  #readHolder(): LockInfo | null {
    return readJsonOrNull(this.#path) as LockInfo | null;
  }

  /**
   * Left behind, never in use: the holder of a live lock moves its time on every heartbeat. A
   * lock is abandoned when it is older than this computer's start (its pid may be reused), when
   * no heartbeat moved it for the stale limit, or when its process on this host is gone.
   */
  #abandoned(holder: LockInfo | null): boolean {
    const stat = statOrNull(this.#path);
    if (!stat) return false;
    const age = Date.now() - stat.mtimeMs;
    if (holder === null) return age > UNREADABLE_STALE_MS;
    if (age > this.#staleMs) return true;
    // Another computer's process cannot be asked about: only its age and this start count.
    if (holder.host !== hostname()) return stat.mtimeMs < bootTime();
    return writerGone(holder.pid, stat.mtimeMs);
  }

  /** Move the lock file's time on while it is still ours, so nobody takes it for abandoned. */
  #beat(): void {
    const holder = this.#readHolder();
    if (holder?.pid !== process.pid || holder.startedAt !== this.#ownStartedAt) return;
    try {
      const now = new Date();
      utimesSync(this.#path, now, now);
    } catch {
      // Gone already; the release that follows has nothing to do.
    }
  }

  #tryAcquire(operation: string): boolean {
    let fd: number;
    try {
      fd = openSync(this.#path, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      this.#clearAbandoned();
      return false;
    }
    const info: LockInfo = { pid: process.pid, host: hostname(), operation, startedAt: Date.now() };
    try {
      writeSync(fd, JSON.stringify(info));
    } catch (error) {
      // A disk that is full: an empty lock file left here would hold every caller off a minute.
      closeSync(fd);
      unlinkSync(this.#path);
      throw error;
    }
    closeSync(fd);
    this.#ownStartedAt = info.startedAt;
    return true;
  }

  /**
   * Take away a lock file left behind. Between judging it abandoned and removing it, another
   * process may have cleared it and taken a fresh lock of its own: so the file is first moved
   * aside, which is atomic, and a file that is not the one judged goes straight back.
   */
  #clearAbandoned(): void {
    const judged = statOrNull(this.#path);
    if (!judged || !this.#abandoned(this.#readHolder())) return;
    const aside = `${this.#path}.stale-${randomUUID()}`;
    try {
      renameSync(this.#path, aside);
    } catch {
      // Someone else cleaned it up first.
      return;
    }
    if (statOrNull(aside)?.ino !== judged.ino) {
      try {
        // A link, unlike a rename, never replaces a lock taken meanwhile.
        linkSync(aside, this.#path);
      } catch {
        // Another lock is there already.
      }
    }
    try {
      unlinkSync(aside);
    } catch {
      // Nothing left to tidy.
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
    this.#heartbeat = setInterval(() => this.#beat(), this.#heartbeatMs);
    this.#heartbeat.unref();
    return hold;
  }

  #leave(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
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
    return this.#queue.run(async () => {
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
