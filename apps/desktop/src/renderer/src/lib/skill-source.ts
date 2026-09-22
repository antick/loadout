import { MARKETPLACE_NAME, type Skill } from "@loadout/shared";

/** Credentials inside a clone URL are never shown. */
const URL_CREDENTIALS_PATTERN = /\/\/[^/@]+@/;

/**
 * The skill has an upstream it can be updated from: a Git repository, the marketplace, or the
 * folder or archive it was imported from. Edits to such a skill can be replaced by an update.
 */
export function hasTrackedSource(skill: Skill): boolean {
  if (skill.sourceType === "git" || skill.sourceType === "marketplace") return true;
  return Boolean(skill.sourceRef);
}

/** Short name of where the skill is updated from, for sentences like "updated from …". */
export function sourceLabelOf(skill: Skill): string {
  if (skill.sourceType === "marketplace") return MARKETPLACE_NAME;
  const ref = skill.sourceType === "git" ? (skill.sourceUrl ?? skill.sourceRef) : skill.sourceRef;
  return (ref ?? "").replace(URL_CREDENTIALS_PATTERN, "//");
}
