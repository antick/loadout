import { flagBoolean } from "../args";
import { exitCodeFor } from "../exit-codes";
import { failureLines } from "../output";
import { eachItem, fieldView, positionalsFrom, resolveSkills, undoFlag } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const UNDO_FLAG = undoFlag("Take the skills out of the favourites again.");

/** Make skills favorites, or take that back. */
async function favorite({ core, args }: CommandContext): Promise<CommandResult> {
  const undo = flagBoolean(args, UNDO_FLAG.name);
  const skills = resolveSkills(core, positionalsFrom(args, 0, "a skill"));
  const { done, failed } = await eachItem(
    skills,
    (skill) => skill.name,
    (skill) => core.api.skills.setFavorite(skill.id, !undo),
  );
  const names = done.map((skill) => skill.name).join(", ");
  const lines =
    done.length > 0 ? [undo ? `No longer favourites: ${names}.` : `Favourites: ${names}.`] : [];
  return {
    value: { skills: done.map((skill) => fieldView(skill, "favoritedAt")), failed },
    text: [...lines, ...failureLines(failed)].join("\n"),
    exitCode: exitCodeFor(failed.length > 0),
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
