import { CLAWHUB_NAME, MARKETPLACE_NAME, type Skill } from "@loadout/shared";

/** Credentials inside a clone URL are never shown. */
const URL_CREDENTIALS_PATTERN = /\/\/[^/@]+@/;
/** Sources on the network: checked and updated by fetching, not by reading a local path. */
const REMOTE_SOURCE_TYPES: ReadonlySet<Skill["sourceType"]> = new Set([
  "git",
  "marketplace",
  "clawhub",
]);

/** The skill came from a Git repository or a marketplace. */
export function isRemoteSource(skill: Skill): boolean {
  return REMOTE_SOURCE_TYPES.has(skill.sourceType);
}

/** The skill records where it came from, so its library copy can be compared with it. */
export function hasSource(skill: Skill): boolean {
  return Boolean(skill.sourceRef ?? skill.sourceUrl);
}

/**
 * The skill has an upstream it can be updated from: a Git repository, the marketplace, or the
 * folder or archive it was imported from. Edits to such a skill can be replaced by an update.
 */
export function hasTrackedSource(skill: Skill): boolean {
  return isRemoteSource(skill) || Boolean(skill.sourceRef);
}

/** Short name of where the skill is updated from, for sentences like "updated from …". */
export function sourceLabelOf(skill: Skill): string {
  if (skill.sourceType === "marketplace") return MARKETPLACE_NAME;
  if (skill.sourceType === "clawhub") return CLAWHUB_NAME;
  const ref = skill.sourceType === "git" ? (skill.sourceUrl ?? skill.sourceRef) : skill.sourceRef;
  return (ref ?? "").replace(URL_CREDENTIALS_PATTERN, "//");
}
