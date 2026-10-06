import type { BatchFailure, LocalSkill, WorkspaceApi } from "@loadout/shared";
import { errorMessage } from "../errors";

const REASON_MANAGED = "already managed";
const REASON_LIBRARY_DIFFERS =
  "the library holds a different version that adopting would overwrite - settle it in the app first";

/** A skill in an agent's folder as adopting reports it. */
export interface AdoptEntry {
  name: string;
  relativePath: string;
  syncStatus: LocalSkill["syncStatus"];
  /** The library skill it became; only once adopted for real. */
  skillId?: string;
}

export interface AdoptResult {
  adopted: AdoptEntry[];
  skipped: { name: string; relativePath: string; reason: string }[];
  failed: BatchFailure[];
}

/** Why a skill is left out: adopting overwrites its library match, never a library that moved on. */
function skipReason(skill: LocalSkill): string | null {
  if (skill.managed) return REASON_MANAGED;
  if (skill.syncStatus === "library_newer" || skill.syncStatus === "diverged") {
    return REASON_LIBRARY_DIFFERS;
  }
  return null;
}

const entryOf = (skill: LocalSkill): AdoptEntry => ({
  name: skill.name,
  relativePath: skill.relativePath,
  syncStatus: skill.syncStatus,
});

/**
 * Copy every skill in an agent's own folder into the library and manage it from there
 * (`skills adopt`). A dry run lists what would be adopted and what is left out, and changes
 * nothing. One skill that fails does not stop the rest.
 */
export async function adoptAgentSkills(
  workspace: Pick<WorkspaceApi, "list" | "upload">,
  agentKey: string,
  options: { dryRun?: boolean } = {},
): Promise<AdoptResult> {
  const found = await workspace.list(agentKey);
  const candidates = found.filter((skill) => skipReason(skill) === null);
  const skipped = found.flatMap((skill) => {
    const reason = skipReason(skill);
    return reason === null ? [] : [{ name: skill.name, relativePath: skill.relativePath, reason }];
  });
  if (options.dryRun) return { adopted: candidates.map(entryOf), skipped, failed: [] };
  const adopted: AdoptEntry[] = [];
  const failed: BatchFailure[] = [];
  for (const skill of candidates) {
    try {
      const librarySkill = await workspace.upload(agentKey, skill.relativePath);
      adopted.push({ ...entryOf(skill), skillId: librarySkill.id });
    } catch (error) {
      failed.push({ name: skill.name, message: errorMessage(error) });
    }
  }
  return { adopted, skipped, failed };
}
