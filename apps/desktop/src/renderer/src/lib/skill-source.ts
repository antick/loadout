import { CLAWHUB_NAME, MARKETPLACE_NAME, type Skill } from "@loadout/shared";

/** Credentials inside a clone URL are never shown. */
const URL_CREDENTIALS_PATTERN = /\/\/[^/@]+@/;
/** The skill records where it came from, so its library copy can be compared with it. */
export function hasSource(skill: Skill): boolean {
  return Boolean(skill.sourceRef ?? skill.sourceUrl);
}

/** Short name of where the skill is updated from, for sentences like "updated from …". */
export function sourceLabelOf(skill: Skill): string {
  if (skill.sourceType === "marketplace") return MARKETPLACE_NAME;
  if (skill.sourceType === "clawhub") return CLAWHUB_NAME;
  const ref = skill.sourceType === "git" ? (skill.sourceUrl ?? skill.sourceRef) : skill.sourceRef;
  return (ref ?? "").replace(URL_CREDENTIALS_PATTERN, "//");
}
