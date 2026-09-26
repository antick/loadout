import type { RenameResult } from "@loadout/shared";
import { flagBoolean } from "../args";
import { DRY_RUN_FLAG, limitPositionals, positional } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

function describe(result: RenameResult): string[] {
  const verb = result.dryRun ? "Would rename" : "Renamed";
  const lines = [`${verb} ${result.from} to ${result.to}.`];
  if (result.agents.length > 0) {
    lines.push(`  Deployments moved for: ${result.agents.join(", ")}`);
  }
  for (const link of result.projectLinks) lines.push(`  Project link: ${link}`);
  for (const copy of result.projectCopies) {
    lines.push(`  Project copy left under its old name: ${copy}`);
  }
  for (const failure of result.failed)
    lines.push(`  Not deployed again: ${failure.name} - ${failure.message}`);
  if (result.dryRun) lines.push("Nothing was changed.");
  return lines;
}

/** Give a library skill a new name, and move its deployments and project links with it. */
async function rename({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 2);
  const skill = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
  const name = positional(args, 1, "the new name");
  const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
  const result = await core.api.skills.rename(skill.id, name, { dryRun });
  return {
    value: result,
    text: describe(result).join("\n"),
    exitCode: result.failed.length > 0 ? 1 : 0,
  };
}

export const renameCommand: CommandSpec = {
  name: "rename",
  summary: "Give a skill a new name, everywhere it is deployed",
  usage: "<ref> <new-name> [--dry-run]",
  flags: [DRY_RUN_FLAG],
  notes: [
    "Renames the library folder and the name in SKILL.md, moves every deployment, and re-points links inside projects. Copies inside projects keep their old name.",
    "Refused, with nothing changed, when the name is taken or badly formed, a folder of that name is in an agent's way (TARGET_CONFLICT), or a copy was edited in an agent's folder. Exit code 1 when a deployment could not be made again.",
  ],
  run: rename,
};
