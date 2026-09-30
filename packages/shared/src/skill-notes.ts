/**
 * A note the user keeps on a library skill: why it is there, when to use it, what to watch for.
 * Kept by Loadout and backed up with the tags, never written into SKILL.md. The search finds it.
 */

/** A note is at most this long; longer text is cut. */
export const SKILL_NOTE_MAX_LENGTH = 2000;

/** The note as stored: trimmed and capped, or null when there is nothing left. */
export function cleanSkillNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, SKILL_NOTE_MAX_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : null;
}
