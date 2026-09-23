import { existsSync } from "node:fs";
import { formatBytes } from "@loadout/shared";
import { UsageError, flagBoolean, flagString } from "../args";
import { plural } from "../output";
import { YES_FLAG, resolveSkills, resolveUserPath } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const OUT_FLAG = {
  name: "out",
  type: "string",
  value: "file",
  description: "Where to write the archive, ending in .zip or .skill.",
} as const;
const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every skill in the library.",
} as const;

/** Pack skills into one archive that `skills install` (or the app) can install again. */
async function exportSkills(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  const refs = args.positionals;
  const all = flagBoolean(args, ALL_FLAG.name);
  if ((refs.length === 0) === !all) throw new UsageError("Give one or more skills, or --all.");
  const out = flagString(args, OUT_FLAG.name);
  if (!out) throw new UsageError(`--${OUT_FLAG.name} <file> is required.`);
  const path = resolveUserPath(out, cwd, core.ctx.homeDir);
  if (existsSync(path) && !flagBoolean(args, YES_FLAG.name)) {
    throw new UsageError(`${path} already exists. Add --yes to replace it.`);
  }

  const skills = all ? await core.api.skills.list() : resolveSkills(core, refs);
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
  usage: "<ref>… | --all --out <file> [--yes]",
  flags: [OUT_FLAG, ALL_FLAG, YES_FLAG],
  notes: [
    "Each skill is a folder in the archive. Install it again with: skills install ./file.zip",
  ],
  run: exportSkills,
};
