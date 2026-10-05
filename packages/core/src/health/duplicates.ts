import {
  CLI_COMMANDS,
  type DuplicatesReport,
  type HealthFinding,
  type Skill,
  formatSimilarity,
} from "@loadout/shared";

const WHY = {
  identical: "has exactly the same files as",
  content: "is mostly the same text as",
  name: "has a similar name and description to",
} as const;

/** One note per pair of skills that may be one; the person decides which to keep. */
export function duplicateFindings(
  report: DuplicatesReport,
  skills: readonly Skill[],
): HealthFinding[] {
  const nameOf = new Map(skills.map((skill) => [skill.id, skill.name]));
  return report.pairs.map((pair) => ({
    area: "duplicates" as const,
    severity: "info" as const,
    skill: nameOf.get(pair.a) ?? pair.a,
    message: `${WHY[pair.reason]} "${nameOf.get(pair.b) ?? pair.b}" (${formatSimilarity(
      Math.max(pair.contentScore, pair.nameScore),
    )} alike). See \`${CLI_COMMANDS.duplicates}\`.`,
  }));
}
