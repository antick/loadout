import { formatBytes } from "@loadout/shared";
import { UsageError, flagString } from "../args";
import { plural } from "../output";
import {
  OVERWRITE_FLAG,
  refuseOverwrite,
  resolveSkills,
  resolveUserPath,
  allSkillsFlag,
  refsOrAll,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const OUT_FLAG = {
  name: "out",
  type: "string",
  value: "file",
  description: "Where to write the archive, ending in .zip or .skill.",
} as const;
const ALL_FLAG = allSkillsFlag();

/** Pack skills into one archive that `skills install` (or the app) can install again. */
async function exportSkills(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  const refs = refsOrAll(args);
  const out = flagString(args, OUT_FLAG.name);
  if (!out) throw new UsageError(`--${OUT_FLAG.name} <file> is required.`);
  const path = resolveUserPath(out, cwd, core.ctx.homeDir);
  refuseOverwrite(args, path);

  const skills = refs ? resolveSkills(core, refs) : await core.api.skills.list();
  const value = await core.api.skills.exportArchive(
    skills.map((skill) => skill.id),
    path,
  );
  return {
    value,
    text: `Exported ${plural(value.skillCount, "skill")} to ${value.path} (${formatBytes(value.bytes)}).`,
  };
}

export const exportCommand: CommandSpec = {
  name: "export",
  summary: "Pack skills into one .zip to share or back up",
  usage: "<ref>… | --all --out <file>",
  flags: [OUT_FLAG, ALL_FLAG, OVERWRITE_FLAG],
  notes: [
    "Each skill is a folder in the archive. Install it again with: skills install ./file.zip",
  ],
  run: exportSkills,
};
