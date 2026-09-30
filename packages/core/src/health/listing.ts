import {
  type HealthFinding,
  type SkillListingReport,
  biggestListed,
  formatNumber,
} from "@loadout/shared";

/** How many of the biggest skills the message names. */
const NAMED = 3;

/**
 * A warning when the agent's skill listing is over its budget: it then drops the descriptions of
 * the skills used least, and a skill without its description is rarely picked. Says nothing while
 * the listing fits, or for an agent with no estimate.
 */
export function listingFindings(report: SkillListingReport | null): HealthFinding[] {
  if (!report || report.over === 0) return [];
  const biggest = biggestListed(report, NAMED)
    .map((entry) => `${entry.name} (${formatNumber(entry.chars)})`)
    .join(", ");
  return [
    {
      area: "listing",
      severity: "warning",
      agent: report.agentKey,
      message:
        `The skill listing is about ${formatNumber(report.over)} characters over the budget ` +
        `(about ${formatNumber(report.used)} of ${formatNumber(report.budget)}), so ${report.agentName} ` +
        `cuts the descriptions of the skills used least. Biggest: ${biggest}. ` +
        "Shorten those descriptions, or set `disable-model-invocation: true` on skills you call by name.",
    },
  ];
}
