import type { Skill } from "@loadout/shared";
import { flagBoolean } from "../args";
import { positionalsFrom, resolveSkills } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const UNDO_FLAG = {
  name: "undo",
  type: "boolean",
  description: "Take the skills out of the favourites again.",
} as const;

/** Make skills favorites, or take that back. */
async function favorite({ core, args }: CommandContext): Promise<CommandResult> {
  const undo = flagBoolean(args, UNDO_FLAG.name);
  const skills = resolveSkills(core, positionalsFrom(args, 0, "a skill"));
  const value: Skill[] = [];
  for (const skill of skills) value.push(await core.api.skills.setFavorite(skill.id, !undo));
  const names = value.map((skill) => skill.name).join(", ");
  return {
    value,
    text: undo ? `No longer favourites: ${names}.` : `Favourites: ${names}.`,
  };
}

export const favoriteCommand: CommandSpec = {
  name: "favorite",
  summary: "Mark skills as favourites, or take that back",
  usage: "<ref>…",
  flags: [UNDO_FLAG],
  notes: ["Kept by Loadout and backed up with the tags. skills list --favorites shows them."],
  run: favorite,
};
