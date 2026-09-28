/**
 * Outlines a new skill's `SKILL.md` can start from. Each one is only the body: the frontmatter
 * and the heading are the same for all of them and written by `newSkillDocument`.
 */

export const NEW_SKILL_TEMPLATES = ["outline", "detailed", "workflow", "blank"] as const;

export type NewSkillTemplate = (typeof NEW_SKILL_TEMPLATES)[number];

/** The outline a skill gets when nothing else is chosen. */
export const DEFAULT_NEW_SKILL_TEMPLATE: NewSkillTemplate = "outline";

export function isNewSkillTemplate(value: unknown): value is NewSkillTemplate {
  return NEW_SKILL_TEMPLATES.some((template) => template === value);
}

const BODIES: Record<NewSkillTemplate, readonly string[]> = {
  outline: [
    "## When to use",
    "",
    "Describe the requests or situations where an agent should use this skill.",
    "",
    "## Instructions",
    "",
    "Write the steps the agent should follow, in order.",
  ],
  detailed: [
    "## When to use",
    "",
    "Describe the requests or situations where an agent should use this skill.",
    "",
    "## Instructions",
    "",
    "1. Write the first step.",
    "2. Write the next step.",
    "3. Say how the agent knows it is done.",
    "",
    "## Examples",
    "",
    "**Request:** A typical request this skill handles.",
    "",
    "**Result:** What a good answer looks like.",
    "",
    "## Edge cases",
    "",
    "- A situation where the usual steps do not apply, and what to do instead.",
    "",
    "## References",
    "",
    "Keep long material in files beside this one, such as `references/guide.md`, and link them",
    "here. Agents open them only when the task needs them.",
  ],
  workflow: [
    "## When to use",
    "",
    "Describe the task this workflow carries out from start to finish.",
    "",
    "## Checklist",
    "",
    "Copy this checklist into your reply and tick each item off as you go:",
    "",
    "- [ ] Step 1: Gather what the task needs",
    "- [ ] Step 2: Make the change",
    "- [ ] Step 3: Check the result",
    "",
    "## Step 1: Gather what the task needs",
    "",
    "Say what to read or ask for first.",
    "",
    "## Step 2: Make the change",
    "",
    "Say exactly what to do.",
    "",
    "## Step 3: Check the result",
    "",
    "Say how to verify the work, and what to do when the check fails.",
  ],
  blank: [],
};

/** The lines of `template`'s body, after the heading. */
export function newSkillTemplateBody(template: NewSkillTemplate): readonly string[] {
  return BODIES[template];
}
