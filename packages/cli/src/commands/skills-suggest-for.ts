import { SUGGEST_FOR_MAX_PATTERNS } from "@loadout/shared";
import { flagBoolean, flagList } from "../args";
import { limitPositionals, positional } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ADD_FLAG = {
  name: "add",
  type: "list",
  value: "pattern",
  description: "File pattern to add, like Cargo.toml, *.rs or prisma/**. Repeatable.",
} as const;
const REMOVE_FLAG = {
  name: "remove",
  type: "list",
  value: "pattern",
  description: "Pattern to take off. Repeatable.",
} as const;
const CLEAR_FLAG = {
  name: "clear",
  type: "boolean",
  description: "Take every pattern off.",
} as const;

/** Show or change the file patterns of projects a skill is suggested for. */
async function suggestFor({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const skill = core.store.resolve(positional(args, 0, "skill"));
  const add = flagList(args, ADD_FLAG.name);
  const remove = new Set(flagList(args, REMOVE_FLAG.name));
  const clear = flagBoolean(args, CLEAR_FLAG.name);
  const changing = clear || add.length > 0 || remove.size > 0;
  const patterns = changing
    ? [...(clear ? [] : skill.suggestFor.filter((pattern) => !remove.has(pattern))), ...add]
    : skill.suggestFor;
  const saved = changing ? await core.api.skills.setSuggestFor(skill.id, patterns) : skill;
  const text =
    saved.suggestFor.length > 0
      ? `${saved.name} is suggested for projects with:\n${saved.suggestFor.map((p) => `  ${p}`).join("\n")}`
      : `${saved.name} has no patterns; it is suggested only for technologies it names.`;
  return { value: saved.suggestFor, text };
}

export const suggestForCommand: CommandSpec = {
  name: "suggest-for",
  summary: "File patterns of projects a skill is suggested for",
  usage: "<ref>",
  flags: [ADD_FLAG, REMOVE_FLAG, CLEAR_FLAG],
  notes: [
    "A pattern without a / matches a file or folder name anywhere in the project; one with a / matches from the top. * is anything but /, ** any folders.",
    `Kept by Loadout and backed up with the tags, never written into SKILL.md. At most ${SUGGEST_FOR_MAX_PATTERNS}.`,
  ],
  run: suggestFor,
};
