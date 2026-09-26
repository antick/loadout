import { NEW_SKILL_DOCUMENT } from "@loadout/shared";
import { UsageError, flagString } from "../args";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const DESCRIPTION_FLAG = {
  name: "description",
  type: "string",
  value: "text",
  description: "What the skill does and when an agent should use it.",
} as const;

/** Write a new skill into the library, ready to fill in and deploy. */
async function createSkill(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const [name, ...extra] = args.positionals;
  if (!name || extra.length > 0) throw new UsageError("Give exactly one name for the new skill.");
  const description = flagString(args, DESCRIPTION_FLAG.name);
  if (!description) throw new UsageError(`--${DESCRIPTION_FLAG.name} <text> is required.`);

  const skill = await core.api.skills.create({ name, description });
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
  flags: [DESCRIPTION_FLAG],
  notes: [
    "The name uses lowercase letters, numbers and single hyphens; it is also the folder name.",
  ],
  run: createSkill,
};
