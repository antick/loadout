import { defaultFilter } from "cmdk";

/**
 * Start of a command list value for a skill the library's own search (`matchesSkillQuery`)
 * already matched. Such a row always stays: cmdk's fuzzy filter would hide skills found by their
 * description or by words in another order.
 */
export const MATCHED_SKILL_VALUE = "skill ";

/** cmdk filter: rows already matched stay, everything else is left to cmdk. */
export function keepMatchedSkills(value: string, search: string, keywords?: string[]): number {
  return value.startsWith(MATCHED_SKILL_VALUE) ? 1 : defaultFilter(value, search, keywords);
}
