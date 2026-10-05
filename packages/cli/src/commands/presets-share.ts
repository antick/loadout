import {
  PRESET_FILE_EXTENSION,
  type PresetImportPlan,
  type PresetImportSkillState,
  presetFileName,
} from "@loadout/shared";
import { flagBoolean, flagList, flagString } from "../args";
import { plural, table } from "../output";
import {
  ACCEPT_RISK_FLAG,
  DRY_RUN_FLAG,
  OVERWRITE_FLAG,
  limitPositionals,
  positional,
  refuseOverwrite,
  resolvePreset,
  resolveUserPath,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";

const OUT_FLAG = {
  name: "out",
  type: "string",
  value: "file",
  description: `File to write. Default: <preset name>${PRESET_FILE_EXTENSION} in this folder.`,
} as const;
const NO_FILES_FLAG = {
  name: "no-files",
  type: "boolean",
  description: "Leave out the files of skills without a source; they are listed by name only.",
} as const;
const NAME_FLAG = {
  name: "name",
  type: "string",
  value: "text",
  description: "Name of the new preset. Default: the name in the file (numbered when taken).",
} as const;

const REUSE_FLAG = {
  name: "use-library",
  type: "list",
  value: "skill",
  description:
    "Use the library's skill of this name after all, though it is a different skill. Repeat for several.",
} as const;

const WEB_LINK = /^https?:\/\//i;
const STATE_WORDS: Record<PresetImportSkillState, string> = {
  library: "in the library",
  source: "install from",
  files: "install from the file",
  missing: "cannot be had",
};

async function exportPreset(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, "a preset (name or id)"));
  const out = flagString(args, OUT_FLAG.name) ?? presetFileName(preset.name);
  const path = resolveUserPath(out, cwd, core.ctx.homeDir);
  refuseOverwrite(args, path);
  const result = await core.api.presets.exportFile(preset.id, path, {
    includeFiles: !flagBoolean(args, NO_FILES_FLAG.name),
  });
  const lines = [`Wrote ${result.path}: ${plural(result.skills, "skill")}.`];
  if (result.embedded > 0)
    lines.push(`${plural(result.embedded, "skill")} without a source went in with its files.`);
  if (result.nameOnly.length > 0) {
    lines.push(`By name only (no source, files left out): ${result.nameOnly.join(", ")}`);
  }
  lines.push("Share it; others run: presets import <file or link>");
  return { value: result, text: lines.join("\n") };
}

function planText(plan: PresetImportPlan): string {
  const beside = plan.skills.filter(
    (skill) => skill.sameNameSkillId !== null && skill.state !== "library",
  );
  return [
    `Preset: ${plan.name}${plan.nameTaken ? " (a preset has this name; the import gets a number)" : ""}`,
    table(
      ["skill", "what happens", "from"],
      plan.skills.map((skill) => [skill.name, STATE_WORDS[skill.state], skill.from]),
      "The preset lists no skills.",
    ),
    ...(beside.length > 0
      ? [
          `Your library has a different skill of the same name (another source or other files), so these are installed beside it under a free name (--use-library <name> uses yours): ${beside.map((skill) => skill.name).join(", ")}`,
        ]
      : []),
  ].join("\n");
}

async function importPreset(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const raw = positional(args, 0, "a preset file or an https link");
  const input = WEB_LINK.test(raw) ? raw : resolveUserPath(raw, cwd, core.ctx.homeDir);
  const reuseSameName = flagList(args, REUSE_FLAG.name);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const found = await core.api.presets.previewImport(input, { reuseSameName });
    // The preview reads the file's name; --name gives the preset another, as the real run does.
    const name = flagString(args, NAME_FLAG.name)?.trim();
    const presets = name ? await core.api.presets.list() : [];
    const plan = name
      ? {
          ...found,
          name,
          nameTaken: presets.some((preset) => preset.name.toLowerCase() === name.toLowerCase()),
        }
      : found;
    return {
      value: { dryRun: true, plan },
      text: `Dry run: nothing was installed.\n${planText(plan)}`,
    };
  }
  const result = await core.api.presets.importFile(input, {
    name: flagString(args, NAME_FLAG.name),
    acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
    reuseSameName,
  });
  const lines = [
    `Created preset ${result.preset.name} with ${plural(result.preset.skillIds.length, "skill")}.`,
  ];
  if (result.installed.length > 0) lines.push(`Installed: ${result.installed.join(", ")}`);
  if (result.reused.length > 0) lines.push(`Already in the library: ${result.reused.join(", ")}`);
  for (const failure of result.failed)
    lines.push(`  Not added: ${failure.name}: ${failure.message}`);
  lines.push(`Next: presets deploy "${result.preset.name}" --agent <key>`);
  return {
    value: { dryRun: false, ...result },
    text: lines.join("\n"),
    exitCode: exitCodeFor(result.failed.length > 0),
  };
}

export const presetExportCommand: CommandSpec = {
  name: "export",
  summary: "Write a preset to a file others can import",
  usage: "<preset>",
  flags: [OUT_FLAG, NO_FILES_FLAG, OVERWRITE_FLAG],
  notes: [
    "Skills from a Git repository or a link are written by their source; others go in with their files, so the file installs them anywhere.",
  ],
  run: exportPreset,
};

export const presetImportCommand: CommandSpec = {
  name: "import",
  summary: "Create a preset from a file or link, installing the skills the library lacks",
  usage: "<file | https link>",
  flags: [NAME_FLAG, REUSE_FLAG, ACCEPT_RISK_FLAG, DRY_RUN_FLAG],
  notes: [
    "Skills the library has are used as they are: the same source; for skills without one, the same name and files; for skills the file only names, the same name. A library skill that only shares the name (another source or branch, other files) is left alone, and the file's skill is installed beside it under a free name; --use-library <name> uses the library's one instead. Every install goes through the safety check.",
    "Exit code 1 when some skills could not be added; the preset is created with the rest.",
  ],
  run: importPreset,
};
