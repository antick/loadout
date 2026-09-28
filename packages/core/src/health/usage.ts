import {
  type HealthFinding,
  type Skill,
  USAGE_RECENT_DAYS,
  type UsageReport,
  isUnusedSkill,
  usageById,
} from "@loadout/shared";

/** Skills no agent ran lately, once usage tracking has read the logs. Good to know, no more. */
export function usageFindings(
  skills: readonly Skill[],
  report: UsageReport | null,
  now = Date.now(),
): HealthFinding[] {
  if (!report?.enabled || report.scannedAt === null) return [];
  const usage = usageById(report);
  return skills
    .filter((skill) => isUnusedSkill(skill, usage, now))
    .map((skill) => ({
      area: "usage" as const,
      severity: "info" as const,
      message: usage.has(skill.id)
        ? `Not run in the last ${USAGE_RECENT_DAYS} days.`
        : "Never run by an agent Loadout reads the logs of.",
      skill: skill.name,
    }));
}
