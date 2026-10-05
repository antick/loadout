import type { BatchUpdateResult, UpdateManyOptions, UpdateResult } from "@loadout/shared";
import { errorMessage, isAppError, notFound, unsupported } from "../errors";
import type { SkillStore } from "../skills/store";
import { checkedSince } from "../sources";
import { isRemoteSource } from "./source";

export const CANNOT_REFRESH = "Source type cannot be refreshed";
/** Where a flagged update is explained: it stays "update available" and nothing changed. */
export const FLAGGED_UPDATE =
  "Held back: the safety check flagged the new version. Update it on its own to read the findings.";

/** The two ways a skill takes its source's new version, with nothing approved or accepted. */
export interface Refresh {
  /** `knownRevision`: what a check found moments ago, installed without asking the remote. */
  update(skillId: string, knownRevision: string | null): Promise<UpdateResult>;
  reimport(skillId: string): Promise<UpdateResult>;
}

/** Update each skill from its source in turn; one failing never stops the others. */
export async function updateEach(
  store: SkillStore,
  refresh: Refresh,
  skillIds: readonly string[],
  options: UpdateManyOptions = {},
): Promise<BatchUpdateResult> {
  const known = options.checkedSince === undefined ? null : checkedSince(options.checkedSince);
  const result: BatchUpdateResult = { updated: 0, unchanged: 0, heldBack: [], failed: [] };
  for (const skillId of skillIds) {
    const skill = store.find(skillId);
    try {
      if (!skill) throw notFound(`Skill not found: ${skillId}`);
      if (!isRemoteSource(skill) && !skill.sourceRef) throw unsupported(CANNOT_REFRESH);
      // A batch never approves removals: those skills wait for the user to look at the list.
      const outcome = isRemoteSource(skill)
        ? await refresh.update(skillId, known?.(skill) ?? null)
        : await refresh.reimport(skillId);
      if (outcome.pendingRemovals.length > 0) result.heldBack.push(skill.name);
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
