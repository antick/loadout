import type { Skill } from "./types";

type SearchableSkill = Pick<Skill, "name" | "description" | "tags" | "sourceRef" | "sourceUrl"> &
  Partial<Pick<Skill, "note">>;

/** What separates the parts of a skill name: `pdf-form_filler v2` has four. */
const NAME_PARTS = /[\s\-_./:]+/;
const WORDS = /\s+/;

/**
 * True when `word` is made of the starts of the name's parts, in order, skipping any: `pdfm`
 * finds `pdf-manipulation`, `rn` finds `release-notes`, `cr` finds `code-review`.
 */
function matchesNameParts(name: string, word: string): boolean {
  const parts = name.toLowerCase().split(NAME_PARTS).filter(Boolean);
  const match = (at: number, from: number): boolean => {
    if (at === word.length) return true;
    for (let index = from; index < parts.length; index += 1) {
      const part = parts[index] ?? "";
      let length = 0;
      while (at + length < word.length && part[length] === word[at + length]) {
        length += 1;
        if (match(at + length, index + 1)) return true;
      }
    }
    return false;
  };
  return word.length > 0 && match(0, 0);
}

/**
 * How every list of skills is searched, ignoring case: the whole text anywhere in the name or one
 * of `others`; or every word of it, each word either in one of those or made of the starts of the
 * name's parts (`pdfm` for `pdf-manipulation`). An empty query matches everything.
 */
export function matchesNamedQuery(
  name: string,
  others: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const fields = [name, ...others].flatMap((field) => (field ? [field.toLowerCase()] : []));
  if (fields.some((field) => field.includes(needle))) return true;
  return needle
    .split(WORDS)
    .every((word) => fields.some((field) => field.includes(word)) || matchesNameParts(name, word));
}

/**
 * The library search, shared by the app and the command line: the name, description, tags, note
 * and source of a library skill (see `matchesNamedQuery`).
 */
export function matchesSkillQuery(skill: SearchableSkill, query: string): boolean {
  return matchesNamedQuery(
    skill.name,
    [skill.description, skill.tags.join(" "), skill.sourceRef, skill.sourceUrl, skill.note],
    query,
  );
}
