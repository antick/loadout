import type { LocalSkill, SkillDuplicate, SyncStatus } from "@loadout/shared";

/** Whether the copies of a skill are switched on: every copy, some of them, or none. */
export type EnabledState = "all" | "partial" | "none";

/**
 * What the shared list, card and detail sheet need to draw one skill found on disk. An agent
 * folder has one folder per entry; a project groups the per-agent copies of a skill into one.
 */
export interface LocalSkillView {
  /** Stable within one list; also the selection id. */
  id: string;
  name: string;
  description: string | null;
  /** Path relative to the scanned skills root, `/` separated. */
  relativePath: string;
  tags: readonly string[];
  fileCount: number;
  syncStatus: SyncStatus;
  enabledState: EnabledState;
  librarySkillId: string | null;
  /** Other copies the same agent loads (a shared folder, or its global folder for a project). */
  duplicates: readonly SkillDuplicate[];
}

/** One folder of an agent's global skills folder as a list entry. */
export function toLocalSkillView(skill: LocalSkill): LocalSkillView {
  return {
    id: skill.relativePath,
    name: skill.name,
    description: skill.description,
    relativePath: skill.relativePath,
    tags: skill.tags,
    fileCount: skill.files.length,
    syncStatus: skill.syncStatus,
    enabledState: skill.enabled ? "all" : "none",
    librarySkillId: skill.librarySkillId,
    duplicates: skill.duplicates,
  };
}
