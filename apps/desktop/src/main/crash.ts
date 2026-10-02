import { writeFileSync } from "node:fs";
import type { Logger } from "@loadout/core";

/** What the handlers need from the running app; `null` before the library has opened. */
export interface CrashTarget {
  log: Logger;
  crashMarkerPath: string;
}

export interface CrashHandlerDeps {
  target(): CrashTarget | null;
  /** Tell the person, before the app goes. */
  showError(message: string): void;
  exit(code: number): void;
}

export interface CrashHandlers {
  uncaughtException(error: unknown): void;
  unhandledRejection(reason: unknown): void;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/**
 * An uncaught exception leaves the main process in an unknown state: it is recorded for the crash
 * notice on the next start, shown, and the app quits. A promise nobody waited on only failed one
 * piece of work, which says so where it ran: it is logged, never reported as a crash.
 */
export function createCrashHandlers(deps: CrashHandlerDeps): CrashHandlers {
  return {
    uncaughtException: (error) => {
      try {
        const target = deps.target();
        target?.log.error("Unhandled failure in the main process", error);
        if (target) {
          writeFileSync(
            target.crashMarkerPath,
            JSON.stringify({ at: Date.now(), message: messageOf(error) }),
          );
        }
        deps.showError(messageOf(error));
      } catch {
        // Nothing more can be done while crashing.
      } finally {
        deps.exit(1);
      }
    },
    unhandledRejection: (reason) => {
      const target = deps.target();
      if (target) target.log.warn("A background task failed and nothing handled it", reason);
      else console.error("A background task failed and nothing handled it", reason);
    },
  };
}
