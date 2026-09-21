import type { SyncOutcome } from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage, isAppError } from "../errors";

/**
 * Automatic backup: once the library has been quiet for a while, run the same sync the button
 * runs. Failures back off and are kept for the Backup page; quitting only commits locally,
 * because nobody should wait for a network on the way out.
 */

export const AUTO_QUIET_MS = 120_000;
export const AUTO_FIRST_CHECK_MS = 90_000;
export const AUTO_MAX_BACKOFF_MS = 60 * 60_000;
const AUTO_COMMIT_MESSAGE = "backup: automatic";
const QUIT_COMMIT_MESSAGE = "backup: on quit";

/** The parts of the backup service the scheduler drives. */
export interface AutoBackupTarget {
  isRepo(): boolean;
  sync(message?: string): Promise<SyncOutcome>;
  /** Commit without touching the network. `failFast`: give up at once when the library is busy. */
  commitLocal(message: string, options: { failFast: boolean }): Promise<boolean>;
  pendingConflicts(): number;
}

export interface AutoBackup {
  /** The library changed: (re)start the quiet period. */
  notifyChanged(): void;
  start(): void;
  stop(): void;
  runOnQuit(): Promise<void>;
}

export function backoffDelay(failures: number): number {
  return Math.min(AUTO_QUIET_MS * 2 ** failures, AUTO_MAX_BACKOFF_MS);
}

export function createAutoBackup(target: AutoBackupTarget, ctx: CoreContext): AutoBackup {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let changedWhileRunning = false;
  let failures = 0;
  let stopped = true;

  const enabled = (): boolean => ctx.settings.get("backupAutoEnabled") && target.isRepo();

  function schedule(delayMs: number): void {
    if (timer) clearTimeout(timer);
    // Never keeps the process alive: a CLI run or a closing app must be free to exit.
    timer = setTimeout(() => void round(), delayMs).unref();
  }

  async function round(): Promise<void> {
    timer = null;
    if (stopped || !enabled()) return;
    if (running) {
      changedWhileRunning = true;
      return;
    }
    running = true;
    try {
      await target.sync(AUTO_COMMIT_MESSAGE);
      failures = 0;
      ctx.settings.set("backupLastAutoError", "");
      ctx.emit("backup:auto-completed", {
        ok: true,
        pending: target.pendingConflicts() > 0,
        error: null,
      });
    } catch (error) {
      if (isAppError(error, "BUSY")) {
        // Someone is working in the library right now; that is not a failure, just bad timing.
        schedule(AUTO_QUIET_MS);
      } else {
        failures += 1;
        const message = errorMessage(error);
        ctx.settings.set("backupLastAutoError", message);
        ctx.log.warn("Automatic backup failed", error);
        ctx.emit("backup:auto-completed", { ok: false, pending: true, error: message });
        schedule(backoffDelay(failures));
      }
    } finally {
      running = false;
      if (changedWhileRunning) {
        changedWhileRunning = false;
        if (!timer && !stopped) schedule(AUTO_QUIET_MS);
      }
    }
  }

  return {
    notifyChanged: () => {
      if (stopped) return;
      if (running) changedWhileRunning = true;
      else schedule(AUTO_QUIET_MS);
    },

    start: () => {
      stopped = false;
      // Soon after launch: pushes what the last quit could only commit locally.
      schedule(AUTO_FIRST_CHECK_MS);
    },

    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },

    runOnQuit: async () => {
      if (!enabled()) return;
      try {
        await target.commitLocal(QUIT_COMMIT_MESSAGE, { failFast: true });
      } catch (error) {
        ctx.log.warn("Could not commit the library on quit", error);
      }
    },
  };
}
