/**
 * A skill whose frontmatter sets `disable-model-invocation: true` asks agents never to pick it on
 * their own: a person has to call it by name (for example `/name`). Only agents that read the
 * field honour it, so the app shows it as information, never as a guarantee.
 */
export const MANUAL_ONLY_KEY = "disable-model-invocation";

/** True for a YAML `true`, and for the text `true` in any letter case. */
export function isManualOnlyValue(value: unknown): boolean {
  if (value === true) return true;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/** Whether parsed frontmatter marks the skill as manual only. */
export function isManualOnly(frontmatter: Readonly<Record<string, unknown>>): boolean {
  return isManualOnlyValue(frontmatter[MANUAL_ONLY_KEY]);
}
