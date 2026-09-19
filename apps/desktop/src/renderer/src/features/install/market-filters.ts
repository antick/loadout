import type { MarketSkill } from "@skillboard/shared";
import { SOURCE_FILTER_ALL } from "@/features/install/constants";

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
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function filterBySource(skills: readonly MarketSkill[], source: string): MarketSkill[] {
  return source === SOURCE_FILTER_ALL ? [...skills] : skills.filter((s) => s.source === source);
}

/** The skill's page on the marketplace website. */
export function marketSkillUrl(baseUrl: string, skill: MarketSkill): string {
  const path = [...skill.source.split("/"), skill.skillId].map(encodeURIComponent).join("/");
  return `${baseUrl}/${path}`;
}
