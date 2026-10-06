import { flagBoolean, flagList, flagString } from "../args";
import { fields, plural, table } from "../output";
import {
  AGENT_FLAG,
  DEPLOY_NOTE,
  DRY_RUN_FLAG,
  LEGACY_YES_FLAG,
  REQUIRED_YES_FLAG,
  SKIP_CONFLICTS_FLAG,
  applyOutcome,
  limitPositionals,
  positional,
  positionalsFrom,
  requireAgent,
  requireYes,
  resolvePreset,
  resolveSkills,
} from "./support";
import { presetExportCommand, presetImportCommand } from "./presets-share";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const DESCRIPTION_FLAG = {
  name: "description",
  type: "string",
  value: "text",
  description: "What the preset is for.",
} as const;
const ICON_FLAG = {
  name: "icon",
  type: "string",
  value: "icon",
  description: "Icon name or emoji shown in the app.",
} as const;
const PRESET_LABEL = "a preset (name or id)";

async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const value = await core.api.presets.list();
  const text = table(
    ["name", "skills", "description"],
    value.map((preset) => [preset.name, preset.skillIds.length, preset.description]),
    "No presets yet.",
  );
  return { value, text };
}

async function show({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
  const skills = preset.skillIds.flatMap((id) => {
    const skill = core.store.find(id);
    return skill
      ? [{ id, name: skill.name, deployedTo: skill.deployments.map((d) => d.agentKey) }]
      : [];
  });
  const text = [
    fields([
      ["Name", preset.name],
      ["Id", preset.id],
      ["Description", preset.description],
    ]),
    table(
      ["skill", "deployed to"],
      skills.map((s) => [s.name, s.deployedTo.join(", ")]),
      "No skills in this preset.",
    ),
  ].join("\n");
  return { value: { ...preset, skills }, text };
}

async function create({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const value = await core.api.presets.create({
    name: positional(args, 0, "a name for the preset"),
    description: flagString(args, DESCRIPTION_FLAG.name) ?? null,
    icon: flagString(args, ICON_FLAG.name) ?? null,
  });
  return { value, text: `Created preset ${value.name} (${value.id}).` };
}

async function remove({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
  requireYes(args, `delete the preset "${preset.name}"`);
  const view = { id: preset.id, name: preset.name, skillCount: preset.skillIds.length };
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    return {
      value: { dryRun: true, deleted: view },
      text: `Would delete preset ${preset.name} (${plural(view.skillCount, "skill")} stay in the library). Nothing was changed.`,
    };
  }
  await core.api.presets.remove(preset.id);
  return { value: { dryRun: false, deleted: view }, text: `Deleted preset ${preset.name}.` };
}

function member(action: "add" | "remove") {
  return async ({ core, args }: CommandContext): Promise<CommandResult> => {
    const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
    const skills = resolveSkills(core, positionalsFrom(args, 1, "a skill"));
    const ids = skills.map((skill) => skill.id);
    if (action === "add") await core.api.presets.addSkills(preset.id, ids);
    else await core.api.presets.removeSkills(preset.id, ids);
    const value = await resolvePreset(core, preset.id);
    const verb = action === "add" ? "now holds" : "is down to";
    return { value, text: `${value.name} ${verb} ${plural(value.skillIds.length, "skill")}.` };
  };
}

/** Every skill of the preset in one request, so conflicts are judged as `skills deploy` does. */
async function deploy({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
  const keys = [...new Set(flagList(args, AGENT_FLAG.name))];
  for (const key of keys) requireAgent(core, key, true);
  const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
  const skipConflicts = flagBoolean(args, SKIP_CONFLICTS_FLAG.name);
  const value = await core.api.presets.applyToDefault(preset.id, {
    dryRun,
    skipConflicts,
    ...(keys.length > 0 ? { agentKeys: keys } : {}),
  });
  return applyOutcome(value, { dryRun, skipConflicts, subject: preset.name });
}

async function undeploy({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
  const keys = [...new Set(flagList(args, AGENT_FLAG.name))];
  for (const key of keys) requireAgent(core, key, false);
  const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
  const value = await core.api.presets.removeFromDefault(preset.id, {
    dryRun,
    ...(keys.length > 0 ? { agentKeys: keys } : { everyHolder: true }),
  });
  return applyOutcome(value, { dryRun, skipConflicts: false, subject: preset.name });
}

export const presetsGroup: CommandGroup = {
  name: "presets",
  summary: "Named sets of skills that are deployed together",
  commands: [
    { name: "list", summary: "List presets", usage: "", flags: [], readOnly: true, run: list },
    {
      name: "show",
      summary: "Show a preset and its skills",
      usage: "<name>",
      flags: [],
      readOnly: true,
      run: show,
    },
    {
      name: "create",
      summary: "Create an empty preset",
      usage: "<name>",
      flags: [DESCRIPTION_FLAG, ICON_FLAG],
      run: create,
    },
    {
      name: "delete",
      summary: "Delete a preset (its skills stay in the library)",
      usage: "<name>",
      flags: [DRY_RUN_FLAG, REQUIRED_YES_FLAG],
      run: remove,
    },
    {
      name: "add",
      summary: "Put skills into a preset",
      usage: "<name> <ref>…",
      flags: [],
      run: member("add"),
    },
    {
      name: "remove",
      summary: "Take skills out of a preset",
      usage: "<name> <ref>…",
      flags: [],
      run: member("remove"),
    },
    {
      name: "deploy",
      summary: "Deploy every skill of a preset",
      usage: "<name>",
      flags: [AGENT_FLAG, SKIP_CONFLICTS_FLAG, DRY_RUN_FLAG],
      notes: [
        "Without --agent: every installed, enabled agent. Per-agent switches set in the app are honoured.",
        DEPLOY_NOTE,
      ],
      run: deploy,
    },
    {
      name: "undeploy",
      summary: "Remove a preset's skills from agents",
      usage: "<name>",
      flags: [AGENT_FLAG, DRY_RUN_FLAG, LEGACY_YES_FLAG],
      notes: [
        "Without --agent: every agent that currently holds one of its skills.",
        "Copies edited in an agent's folder go to Recently removed; `presets deploy` puts the rest back. Preview with --dry-run.",
      ],
      run: undeploy,
    },
    presetExportCommand,
    presetImportCommand,
  ],
};
