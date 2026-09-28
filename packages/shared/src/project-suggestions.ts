/**
 * Library skills worth adding to a project, from what the project holds: file patterns a skill
 * asks for (`Skill.suggestFor`, set in Loadout, never in SKILL.md) and the technologies the
 * project uses (read from its files) that a skill names.
 */

/** At most this many patterns per skill, each at most this long. */
export const SUGGEST_FOR_MAX_PATTERNS = 20;
export const SUGGEST_FOR_MAX_LENGTH = 200;

export type SuggestionReason =
  /** One of the skill's own patterns matched a file or folder in the project. */
  | { kind: "pattern"; pattern: string; match: string }
  /** The project uses a technology the skill names in its name, tags or description. */
  | { kind: "tech"; tech: string; where: "name" | "tags" | "description" };

export interface SkillSuggestion {
  skillId: string;
  /** `strong`: a pattern, or the technology in the skill's name or tags. `weak`: only in its description. */
  strength: "strong" | "weak";
  reasons: SuggestionReason[];
}

export interface ProjectSuggestions {
  /** Technologies found in the project, by label ("React", "Python"). */
  technologies: string[];
  /** Skills not in the project yet, strongest first. Dismissed ones are left out. */
  suggestions: SkillSuggestion[];
  /** Skills the user said are not for this project. */
  dismissed: string[];
}

/** What is wrong with a pattern, or null when it can be used. */
export function suggestPatternProblem(pattern: string): "empty" | "too_long" | "outside" | null {
  const trimmed = pattern.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > SUGGEST_FOR_MAX_LENGTH) return "too_long";
  if (trimmed.startsWith("/") || trimmed.split(/[/\\]/).includes("..")) return "outside";
  return null;
}

/** Patterns trimmed, with blanks, unusable ones and repeats dropped, capped in number. */
export function cleanSuggestPatterns(patterns: readonly unknown[]): string[] {
  const clean = patterns
    .filter((pattern): pattern is string => typeof pattern === "string")
    .map((pattern) => pattern.trim().replace(/\\/g, "/"))
    .filter((pattern) => suggestPatternProblem(pattern) === null);
  return [...new Set(clean)].slice(0, SUGGEST_FOR_MAX_PATTERNS);
}
