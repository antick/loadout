import type { CoreContext } from "../context";
import type { DeployService } from "./service";
import { logRedeployProblems } from "./report-log";

/**
 * Keeps copied deployments in step with a library edited outside the app (by hand, an agent or
 * the CLI). One pass runs at a time; asking during a pass queues exactly one more, so a burst of
 * changes never piles up work.
 */
export interface StaleCopyRefresher {
  /** Refresh stale copies now, or right after the pass that is running. */
  request(): void;
}

export function createStaleCopyRefresher(
  ctx: CoreContext,
  deploy: Pick<DeployService, "refreshStaleCopies">,
): StaleCopyRefresher {
  let running: Promise<void> | null = null;
  let queued = false;
  /** Kept copies stay stale, so every pass sees them again: say so once per copy. */
  const reportedKept = new Set<string>();

  async function pass(): Promise<void> {
    try {
      const report = await deploy.refreshStaleCopies();
      logRedeployProblems(ctx.log, report, "refresh");
      for (const { skill, agent } of report.kept) {
        const key = `${skill}\n${agent}`;
        if (reportedKept.has(key)) continue;
        reportedKept.add(key);
        ctx.log.info(`Kept the copy of ${skill} in ${agent}: it was edited there`);
      }
    } catch (error) {
      ctx.log.warn("Could not refresh deployed copies after an outside change", error);
    }
  }

  async function loop(): Promise<void> {
    do {
      queued = false;
      await pass();
    } while (queued);
  }

  return {
    request: () => {
      if (running) {
        queued = true;
        return;
      }
      running = loop().finally(() => {
        running = null;
      });
    },
  };
}
