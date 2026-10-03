import type { BatchFailure, TargetConflict } from "@loadout/shared";
import type { Logger } from "../log";

/** What a round of redeploying did to deployed copies: refresh them, or move them to a new folder. */
export type RedeployAction = "refresh" | "move";

/** Log what a round left alone (a folder not ours) and what failed; nothing for a clean round. */
export function logRedeployProblems(
  log: Logger,
  report: { conflicts: readonly TargetConflict[]; failed: readonly BatchFailure[] },
  action: RedeployAction,
): void {
  for (const conflict of report.conflicts) {
    log.warn(`Did not ${action} the skill at ${conflict.path}: it ${conflict.reason}`);
  }
  for (const failure of report.failed) {
    log.warn(`Could not ${action} ${failure.name}: ${failure.message}`);
  }
}
