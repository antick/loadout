import { NEW_SKILL_DOCUMENT } from "./new-skill";
import { SKILL_DESCRIPTION_MAX, SKILL_DOCUMENT_MAX_LINES } from "./skill-checks";

/**
 * A prompt to paste into an agent so it writes a new skill in full: the folder already exists with
 * a `SKILL.md` holding the name, the description and an outline, and the agent replaces the
 * outline with the real skill. The rules are the ones Loadout's format and safety checks apply.
 */

export interface SkillAuthoringInput {
  name: string;
  description: string;
  /** Absolute path of the skill's folder. */
  folder: string;
  /**
   * Other folders that hold the same skill (a project skill in several agents' folders). The
   * agent writes the skill in `folder`, then copies the finished folder into each of these.
   */
  copies?: readonly string[];
}

export function skillAuthoringPrompt(input: SkillAuthoringInput): string {
  const copies = input.copies ?? [];
  const copyStep =
    copies.length === 0
      ? ""
      : `
## Copies

This skill also lives in ${copies.length === 1 ? "another folder" : `${copies.length} other folders`}. When it is finished, copy the whole folder above into ${copies.length === 1 ? "this one" : "each of these"}, replacing what is there, so every copy is identical:

${copies.map((path) => `- ${path}`).join("\n")}
`;
  const quoted = input.description
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `Write the agent skill \`${input.name}\` in full, in this folder:

${input.folder}

The folder already holds a ${NEW_SKILL_DOCUMENT} with the skill's name, a first description and an outline. Replace the outline with the real skill. What it is for:

${quoted}

## How an agent reads a skill

1. The \`name\` and \`description\` in the frontmatter are always in the agent's context. The description alone decides whether the skill is used, so it says what the skill does and when to use it: the requests, words, file types and tools that should bring it in. Improve it if you can, and keep it under ${SKILL_DESCRIPTION_MAX} characters.
2. The body of ${NEW_SKILL_DOCUMENT} is read when the skill is used. Keep it under ${SKILL_DOCUMENT_MAX_LINES} lines.
3. Other files are read only when ${NEW_SKILL_DOCUMENT} points to them: \`references/\` for longer material (one file per topic or framework, so only the relevant one is read), \`scripts/\` for code that must run the same way every time, \`assets/\` for templates and files the output uses. Create only the folders this skill needs.

## Writing it

- Instructions in the imperative ("Run the tests"), each with the reason behind it, so the agent can handle cases the text does not name.
- At least one realistic example: a request, and what to do with it.
- The output format, when the skill produces something with a fixed shape.
- Every file ${NEW_SKILL_DOCUMENT} mentions exists, and nothing says "add content here".

## Rules

- Keep \`name: ${input.name}\`: it matches the folder name.
- Keep the frontmatter valid YAML between the two \`---\` lines.
- Write only inside the ${copies.length === 0 ? "folder" : "folders"} above.
- Scripts never download and run code, and never send data anywhere the task does not need.
${copyStep}
When you are done, list the files you wrote.
`;
}
