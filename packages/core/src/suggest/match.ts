import type { Skill, SkillSuggestion, SuggestionReason } from "@loadout/shared";
import { firstMatch } from "./glob";
import type { ProjectFiles } from "./project-files";
import { escapeRegExp } from "../util/text";
import { TECHS, type Tech } from "./tech";

/** Technologies the project shows, in table order. */
function detectTechs(files: ProjectFiles): Tech[] {
  return TECHS.filter(
    (tech) =>
      (tech.packages ?? []).some((name) => files.packages.has(name.toLowerCase())) ||
      (tech.files ?? []).some((pattern) => firstMatch(pattern, files.paths) !== null),
  );
}

const WORD_EDGE = "[a-z0-9]";

/** `name-like_text` → "name like text", lower case, so words match across separators. */
const normalize = (text: string): string => text.toLowerCase().replace(/[-_/]+/g, " ");

/** Whether `word` stands on its own in `text` (not inside a longer word). */
function hasWord(text: string, word: string): boolean {
  const escaped = escapeRegExp(normalize(word));
  return new RegExp(`(?<!${WORD_EDGE})${escaped}(?!${WORD_EDGE})`).test(text);
}

/** Where a skill talks about `tech`, strongest place first; null when it does not. */
function techPlace(skill: Skill, tech: Tech): "name" | "tags" | "description" | null {
  const any = [...tech.words, ...(tech.nameWords ?? [])];
  const name = normalize(`${skill.name} ${skill.dirName}`);
  if (any.some((word) => hasWord(name, word))) return "name";
  const tags = normalize(skill.tags.join(" "));
  if (any.some((word) => hasWord(tags, word))) return "tags";
  const description = normalize(skill.description ?? "");
  return tech.words.some((word) => hasWord(description, word)) ? "description" : null;
}

function suggestionFor(
  skill: Skill,
  files: ProjectFiles,
  techs: readonly Tech[],
): SkillSuggestion | null {
  const reasons: SuggestionReason[] = [];
  for (const pattern of skill.suggestFor) {
    const match = firstMatch(pattern, files.paths);
    if (match !== null) reasons.push({ kind: "pattern", pattern, match });
  }
  for (const tech of techs) {
    const where = techPlace(skill, tech);
    if (where) reasons.push({ kind: "tech", tech: tech.label, where });
  }
  if (reasons.length === 0) return null;
  const strong = reasons.some(
    (reason) => reason.kind === "pattern" || reason.where !== "description",
  );
  return { skillId: skill.id, strength: strong ? "strong" : "weak", reasons };
}

/**
 * Library skills that fit the project, strongest first: its own patterns match, or it names a
 * technology the project uses. Skills in `exclude` (already there, or dismissed) are left out.
 */
export function matchSkills(
  skills: readonly Skill[],
  files: ProjectFiles,
  exclude: ReadonlySet<string>,
): { technologies: string[]; suggestions: SkillSuggestion[] } {
  const techs = detectTechs(files);
  const suggestions = skills
    .filter((skill) => !exclude.has(skill.id))
    .flatMap((skill) => suggestionFor(skill, files, techs) ?? [])
    .sort(
      (a, b) =>
        Number(b.strength === "strong") - Number(a.strength === "strong") ||
        b.reasons.length - a.reasons.length,
    );
  return { technologies: techs.map((tech) => tech.label), suggestions };
}
