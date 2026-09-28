import {
  type HealthFinding,
  SOURCE_STALE_AFTER_MS,
  type Skill,
  formatDate,
  groupSkillSources,
} from "@loadout/shared";
import { lstatOrNull } from "../util/fs";

/** The newest time any of `skills` was checked for updates, or installed when never checked. */
function lastLook(skills: readonly Skill[]): number {
  return Math.max(...skills.map((skill) => skill.lastCheckedAt ?? skill.createdAt));
}

/**
 * Sources that went quiet: a repository or link nobody checked for updates in a month, and an
 * archive file that is no longer there. Problems of single skills are the updates area's.
 */
export function sourceFindings(skills: readonly Skill[], now = Date.now()): HealthFinding[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return groupSkillSources(skills).flatMap((source): HealthFinding[] => {
    const members = source.skillIds.flatMap((id) => byId.get(id) ?? []);
    const base = { area: "sources" as const, source: source.label, path: source.location };
    if (source.kind === "archive") {
      // Skills a check already found without a source say so themselves.
      const allFlagged = members.every((skill) => skill.updateStatus === "source_missing");
      if (lstatOrNull(source.location) !== null || allFlagged) return [];
      return [
        {
          ...base,
          severity: "warning",
          message: "The archive its skills came from is gone, so they cannot update from it.",
        },
      ];
    }
    const looked = lastLook(members);
    if (now - looked < SOURCE_STALE_AFTER_MS) return [];
    return [
      {
        ...base,
        severity: "warning",
        message: `Not checked for updates since ${formatDate(looked)}. Run: skills check --all`,
      },
    ];
  });
}
