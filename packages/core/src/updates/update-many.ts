import type { BatchUpdateResult, UpdateManyOptions, UpdateResult } from "@loadout/shared";
import { errorMessage, isAppError } from "../errors";
import type { SkillStore } from "../skills/store";
import { checkedSince } from "../sources";

export const CANNOT_REFRESH = "Source type cannot be refreshed";
/** Where a flagged update is explained: it stays "update available" and nothing changed. */
export const FLAGGED_UPDATE =
  "Held back: the safety check flagged the new version. Update it on its own to read the findings.";

/**
 * One skill takes its source's new version, nothing accepted. `knownRevision`: what a check
 * found moments ago, installed without asking the remote.
 */
export type UpdateOne = (
  skillId: string,
  approval: string | null,
  knownRevision: string | null,
) => Promise<UpdateResult>;

/** Update each skill from its source in turn; one failing never stops the others. */
export async function updateEach(
  store: SkillStore,
  update: UpdateOne,
  skillIds: readonly string[],
  options: UpdateManyOptions = {},
): Promise<BatchUpdateResult> {
  const known = options.checkedSince === undefined ? null : checkedSince(options.checkedSince);
  const result: BatchUpdateResult = { updated: 0, unchanged: 0, heldBack: [], failed: [] };
  for (const skillId of skillIds) {
    const skill = store.find(skillId);
    try {
      const knownRevision = (skill && known?.(skill)) ?? null;
      let outcome = await update(skillId, null, knownRevision);
      // Unless approved, a skill whose update removes files waits for the user to read the list.
      if (options.approveRemovals && outcome.pendingRemovals.length > 0) {
        outcome = await update(skillId, outcome.approval, knownRevision);
      }
      if (outcome.pendingRemovals.length > 0) result.heldBack.push(skill?.name ?? skillId);
      else if (outcome.contentChanged) result.updated += 1;
      else result.unchanged += 1;
    } catch (error) {
      // A batch never asks about findings: a flagged skill waits for its own update.
      const message = isAppError(error, "UNSAFE") ? FLAGGED_UPDATE : errorMessage(error);
      result.failed.push({ name: skill?.name ?? skillId, message });
    }
  }
  return result;
}
