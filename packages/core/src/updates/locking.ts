import type { CoreContext } from "../context";
import { AppError } from "../errors";

/**
 * `wait`: a person asked, so queue behind whatever holds the library.
 * `try`: background work; when the library is busy give up at once with BUSY and come back later.
 */
export type LockMode = "wait" | "try";

const BUSY_MESSAGE = "The skill library is busy; this skill was skipped for now.";

export async function runLocked<T extends object>(
  ctx: CoreContext,
  mode: LockMode,
  operation: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (mode === "wait") return ctx.lock.run(operation, fn);
  const result = await ctx.lock.tryRun(operation, fn);
  if (result === null) throw new AppError("BUSY", BUSY_MESSAGE);
  return result;
}
