import {
  type HealthFinding,
  type Skill,
  USAGE_RECENT_DAYS,
  type UsageReport,
  indexUsage,
  isUnusedSkill,
} from "@loadout/shared";

/** Skills no agent ran lately, once usage tracking has read the logs. Good to know, no more. */
export function usageFindings(
  skills: readonly Skill[],
  report: UsageReport | null,
  now = Date.now(),
): HealthFinding[] {
  const usage = indexUsage(report);
  return skills
    .filter((skill) => isUnusedSkill(skill, usage, now))
    .map((skill) => ({
      area: "usage" as const,
      severity: "info" as const,
      message: usage.byId.has(skill.id)
        ? `Not run in the last ${USAGE_RECENT_DAYS} days.`
        : "Never run by an agent Loadout reads the logs of.",
      skill: skill.name,
    }));
}
