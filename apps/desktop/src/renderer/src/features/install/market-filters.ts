import { clawhubSkillUrl, compareNames, MARKETPLACE_URL, type MarketSkill } from "@loadout/shared";
import { FILTER_ALL } from "@/lib/constants";

export interface SourceOption {
  /** `owner/repo`. */
  source: string;
  count: number;
}

/** Contributors (`owner/repo`) present in the loaded results, most skills first, then by name. */
export function sourceOptions(skills: readonly MarketSkill[]): SourceOption[] {
  const counts = new Map<string, number>();
  for (const skill of skills) counts.set(skill.source, (counts.get(skill.source) ?? 0) + 1);
  return [...counts]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || compareNames(a.source, b.source));
}

export function filterBySource(skills: readonly MarketSkill[], source: string): MarketSkill[] {
  return source === FILTER_ALL ? [...skills] : skills.filter((s) => s.source === source);
}

/** The skill's page on its marketplace's website. */
export function marketSkillUrl(skill: MarketSkill): string {
  if (skill.provider === "clawhub") return clawhubSkillUrl(skill.source, skill.skillId);
  const path = [...skill.source.split("/"), skill.skillId].map(encodeURIComponent).join("/");
  return `${MARKETPLACE_URL}/${path}`;
}
