import type { Skill } from "./types";

type SearchableSkill = Pick<Skill, "name" | "description" | "tags" | "sourceRef" | "sourceUrl">;

/**
 * The library search, shared by the app and the command line: the text anywhere in the name,
 * description, tags or source, ignoring case. An empty query matches everything.
 */
export function matchesSkillQuery(skill: SearchableSkill, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    skill.name,
    skill.description,
    skill.tags.join(" "),
    skill.sourceRef,
    skill.sourceUrl,
  ].some((field) => field?.toLowerCase().includes(needle));
}
