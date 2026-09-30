import { SKILL_NOTE_MAX_LENGTH } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { limitPositionals, positional } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const CLEAR_FLAG = {
  name: "clear",
  type: "boolean",
  description: "Take the note off.",
} as const;

/** Show, set or clear the user's note on a skill. */
async function note({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 2);
  const skill = core.store.resolve(positional(args, 0, "skill"));
  const text = args.positionals[1];
  const clear = flagBoolean(args, CLEAR_FLAG.name);
  if (clear && text !== undefined) throw new UsageError("Give a note or --clear, not both.");
  let saved = skill;
  if (clear) saved = await core.api.skills.setNote(skill.id, null);
  else if (text !== undefined) saved = await core.api.skills.setNote(skill.id, text);
  const shown = saved.note ? `${saved.name}:\n${saved.note}` : `${saved.name} has no note.`;
  return { value: { id: saved.id, name: saved.name, note: saved.note }, text: shown };
}

export const noteCommand: CommandSpec = {
  name: "note",
  summary: "Show, set or clear your own note on a skill",
  usage: "<ref> [<text>] [--clear]",
  flags: [CLEAR_FLAG],
  notes: [
    `Kept by Loadout and backed up with the tags, never written into SKILL.md. The search finds it. At most ${SKILL_NOTE_MAX_LENGTH} characters.`,
  ],
  run: note,
};
