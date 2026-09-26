import { stringify } from "yaml";
import { SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from "./skill-checks";

/**
 * A skill written from scratch. The name follows the Agent Skills format strictly (a new skill has
 * no history to stay compatible with), and it is also the folder name, so the two never differ.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
}

/** File a new skill is written to. */
export const NEW_SKILL_DOCUMENT = "SKILL.md";

export type NewSkillNameProblem = "empty" | "format" | "too_long" | "reserved";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Names Windows cannot use for a folder, whatever the case. */
const WINDOWS_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** What is wrong with `name` as a new skill's name; null when it is fine. */
export function newSkillNameProblem(name: string): NewSkillNameProblem | null {
  if (!name) return "empty";
  if (name.length > SKILL_NAME_MAX) return "too_long";
  if (!NAME_PATTERN.test(name)) return "format";
  if (WINDOWS_DEVICE_NAMES.test(name)) return "reserved";
  return null;
}

/**
 * Typing help for the name field: lowercase, and spaces or underscores become hyphens. Anything
 * else is kept, so the check can say what is wrong instead of the text silently changing.
 */
export function toSkillNameInput(text: string): string {
  return text.toLowerCase().replace(/[\s_]+/g, "-");
}

export type NewSkillDescriptionProblem = "empty" | "too_long";

export function newSkillDescriptionProblem(description: string): NewSkillDescriptionProblem | null {
  if (!description) return "empty";
  if (description.length > SKILL_DESCRIPTION_MAX) return "too_long";
  return null;
}

/** "code-review" → "Code review", the heading a new skill's document starts with. */
function headingFor(name: string): string {
  const words = name.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The first `SKILL.md` of a new skill: frontmatter, then a short outline to write over. */
export function newSkillDocument(input: CreateSkillInput): string {
  const frontmatter = stringify(
    { name: input.name, description: input.description },
    { lineWidth: 0 },
  );
  return [
    "---",
    frontmatter.trimEnd(),
    "---",
    "",
    `# ${headingFor(input.name)}`,
    "",
    "## When to use",
    "",
    "Describe the requests or situations where an agent should use this skill.",
    "",
    "## Instructions",
    "",
    "Write the steps the agent should follow, in order.",
    "",
  ].join("\n");
}
