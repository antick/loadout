import {
  DEFAULT_NEW_SKILL_TEMPLATE,
  NEW_SKILL_DOCUMENT,
  NEW_SKILL_TEMPLATES,
  skillAuthoringPrompt,
} from "@loadout/shared";
import { UsageError, flagBoolean, flagChoice, flagString } from "../args";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const DESCRIPTION_FLAG = {
  name: "description",
  type: "string",
  value: "text",
  description: "What the skill does and when an agent should use it.",
} as const;

const TEMPLATE_FLAG = {
  name: "template",
  type: "string",
  value: "template",
  choices: NEW_SKILL_TEMPLATES,
  description: `Outline to start from: ${NEW_SKILL_TEMPLATES.join(", ")} (default ${DEFAULT_NEW_SKILL_TEMPLATE}).`,
} as const;

const PROMPT_FLAG = {
  name: "prompt",
  type: "boolean",
  description: "Print a prompt for an agent to write the whole skill in its folder.",
} as const;

/** Write a new skill into the library, ready to fill in and deploy. */
async function createSkill(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const [name, ...extra] = args.positionals;
  if (!name || extra.length > 0) throw new UsageError("Give exactly one name for the new skill.");
  const description = flagString(args, DESCRIPTION_FLAG.name);
  if (!description) throw new UsageError(`--${DESCRIPTION_FLAG.name} <text> is required.`);
  const template = flagChoice(args, TEMPLATE_FLAG);

  const skill = await core.api.skills.create({ name, description, template });
  if (flagBoolean(args, PROMPT_FLAG.name)) {
    const prompt = skillAuthoringPrompt({
      name: skill.name,
      description,
      folder: skill.libraryPath,
    });
    return {
      value: { ...skill, prompt },
      text: prompt.trimEnd(),
      notice: `Created ${skill.name}. Paste the prompt above into your agent, then: skills deploy ${skill.name} --agent <key>`,
    };
  }
  return {
    value: skill,
    text: [
      `Created ${skill.name} at ${skill.libraryPath}.`,
      `Write its instructions in ${NEW_SKILL_DOCUMENT}, then: skills deploy ${skill.name} --agent <key>`,
    ].join("\n"),
  };
}

export const createCommand: CommandSpec = {
  name: "create",
  summary: "Start a new skill in the library",
  usage: "<name> --description <text>",
  flags: [DESCRIPTION_FLAG, TEMPLATE_FLAG, PROMPT_FLAG],
  notes: [
    "The name uses lowercase letters, numbers and single hyphens; it is also the folder name.",
    "--prompt prints only the prompt on stdout (pipe it: `... --prompt | claude`); the next",
    "step goes to stderr.",
  ],
  run: createSkill,
};
