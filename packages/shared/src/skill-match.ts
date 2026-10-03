/** The last part of a path, for either slash; the path itself when it has no parts. */
export function lastPathSegment(path: string): string {
  return path.split(/[\\/]/).findLast(Boolean) ?? path;
}

/**
 * Whether a skill a source holds is the one `wanted` names: its path in the source exactly, or
 * its own name or folder name, ignoring case. Never guesses beyond that.
 */
export function skillMatchesName(
  skill: { readonly relPath: string; readonly name: string },
  wanted: string,
): boolean {
  const key = wanted.toLowerCase();
  return (
    skill.relPath === wanted ||
    skill.name.toLowerCase() === key ||
    lastPathSegment(skill.relPath).toLowerCase() === key
  );
}
