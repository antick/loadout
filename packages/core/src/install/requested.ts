import { type RepoSkillPreview, lastPathSegment, skillMatchesName } from "@loadout/shared";
import { invalid } from "../errors";

/** Which skills of a preview were asked for by name, and which names matched nothing. */
export interface RequestedSkills {
  /** Preview keys to tick; null when nothing was asked for, so everything is ticked. */
  selected: string[] | null;
  missing: string[];
}

type Named = Pick<RepoSkillPreview, "relPath" | "name">;

/**
 * The one skill `name` names, the way `skillMatchesName` matches; null when none does. When
 * several do, the one whose folder is exactly `name` wins; otherwise the name is ambiguous.
 */
function namedSkill(skills: readonly Named[], name: string): Named | null {
  const matches = skills.filter((skill) => skillMatchesName(skill, name));
  if (matches.length <= 1) return matches[0] ?? null;
  const exact = matches.filter(
    (skill) => skill.relPath === name || lastPathSegment(skill.relPath) === name,
  );
  if (exact.length === 1) return exact[0] ?? null;
  const paths = matches.map((skill) => skill.relPath).join(", ");
  throw invalid(`"${name}" names several skills: ${paths}. Name the one you want by its path.`);
}

/**
 * Match names from `owner/repo@skill`, `#main@skill`, `--skill` or `skills.toml` against what a
 * source really holds.
 */
export function matchRequested(
  skills: readonly Named[],
  wanted: readonly string[],
): RequestedSkills {
  const names = [...new Set(wanted.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) return { selected: null, missing: [] };
  const selected = new Set<string>();
  const missing: string[] = [];
  for (const name of names) {
    const match = namedSkill(skills, name);
    if (match) selected.add(match.relPath);
    else missing.push(name);
  }
  return { selected: [...selected], missing };
}
