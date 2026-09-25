import type { RepoSkillPreview } from "@loadout/shared";

/** Which skills of a preview were asked for by name, and which names matched nothing. */
export interface RequestedSkills {
  /** Preview keys to tick; null when nothing was asked for, so everything is ticked. */
  selected: string[] | null;
  missing: string[];
}

function lastSegment(relPath: string): string {
  return relPath.split("/").findLast(Boolean) ?? relPath;
}

/**
 * Match names from `owner/repo@skill`, `#main@skill` or `--skill` against what a source really
 * holds: by the skill's own name or its folder name, ignoring case. Never guesses beyond that.
 */
export function matchRequested(
  skills: readonly Pick<RepoSkillPreview, "relPath" | "name">[],
  wanted: readonly string[],
): RequestedSkills {
  const names = [...new Set(wanted.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) return { selected: null, missing: [] };
  const selected = new Set<string>();
  const missing: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    const matches = skills.filter(
      (skill) =>
        skill.name.toLowerCase() === key || lastSegment(skill.relPath).toLowerCase() === key,
    );
    if (matches.length === 0) missing.push(name);
    for (const match of matches) selected.add(match.relPath);
  }
  return { selected: [...selected], missing };
}
