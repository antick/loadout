import { targetConflict } from "@loadout/core";
import type { ApplyResult, Preset } from "@loadout/shared";
import { flagBoolean, flagList, flagString } from "../args";
import { fields, plural, table } from "../output";
import {
  AGENT_FLAG,
  DRY_RUN_FLAG,
  YES_FLAG,
  describeApply,
  emptyApply,
  limitPositionals,
  mergeApply,
  positional,
  positionalsFrom,
  requireAgent,
  requireYes,
  resolvePreset,
  resolveSkills,
} from "./support";
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
  const ref = positional(args, 0, PRESET_LABEL);
  requireYes(args, `delete the preset "${ref}"`);
  const preset = await resolvePreset(core, ref);
  const view = { id: preset.id, name: preset.name, skillCount: preset.skillIds.length };
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    return {
      value: { dryRun: true, wouldDelete: view },
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

/** Deploy to named agents while still honouring the preset's per-skill, per-agent switches. */
async function deployTo(
  { core }: CommandContext,
  preset: Preset,
  agentKeys: readonly string[],
): Promise<ApplyResult> {
  let total = emptyApply();
  for (const skillId of preset.skillIds) {
    const toggles = await core.api.presets.toggles(preset.id, skillId);
    const off = new Set(toggles.filter((toggle) => !toggle.enabled).map((t) => t.agentKey));
    const wanted = agentKeys.filter((key) => !off.has(key));
    total.skipped += agentKeys.length - wanted.length;
    if (wanted.length === 0) continue;
    total = mergeApply(total, await core.api.deploy.apply([skillId], wanted, "add"));
  }
  return total;
}

function finish(preset: Preset, value: ApplyResult): CommandResult {
  if (value.conflicts.length > 0 && value.added === 0) throw targetConflict(value.conflicts);
  const lines = [`${preset.name}: ${describeApply(value)}`];
  for (const conflict of value.conflicts)
    lines.push(`Left alone: ${conflict.path} ${conflict.reason}`);
  const incomplete = value.failed.length > 0 || value.conflicts.length > 0;
  return { value, text: lines.join("\n"), exitCode: incomplete ? 1 : 0 };
}

async function deploy(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
  const keys = [...new Set(flagList(args, AGENT_FLAG.name))];
  for (const key of keys) requireAgent(core, key, true);
  const value =
    keys.length === 0
      ? await core.api.presets.applyToDefault(preset.id)
      : await deployTo(context, preset, keys);
  return finish(preset, value);
}

async function undeploy({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const preset = await resolvePreset(core, positional(args, 0, PRESET_LABEL));
  const named = [...new Set(flagList(args, AGENT_FLAG.name))];
  for (const key of named) requireAgent(core, key, false);
  // No agent named: every agent that really holds one of the preset's skills.
  const keys =
    named.length > 0
      ? named
      : [
          ...new Set(
            preset.skillIds.flatMap(
              (id) => core.store.find(id)?.deployments.map((d) => d.agentKey) ?? [],
            ),
          ),
        ];
  const value =
    keys.length === 0 ? emptyApply() : await core.api.deploy.apply(preset.skillIds, keys, "remove");
  return finish(preset, value);
}

export const presetsGroup: CommandGroup = {
  name: "presets",
  summary: "Named sets of skills that are deployed together",
  commands: [
    { name: "list", summary: "List presets", usage: "", flags: [], run: list },
    {
      name: "show",
      summary: "Show a preset and its skills",
      usage: "<name>",
      flags: [],
      run: show,
    },
    {
      name: "create",
      summary: "Create an empty preset",
      usage: "<name> [--description <text>] [--icon <icon>]",
      flags: [DESCRIPTION_FLAG, ICON_FLAG],
      run: create,
    },
    {
      name: "delete",
      summary: "Delete a preset (its skills stay in the library)",
      usage: "<name> --yes [--dry-run]",
      flags: [YES_FLAG, DRY_RUN_FLAG],
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
      usage: "<name> [--agent <key>…]",
      flags: [AGENT_FLAG],
      notes: [
        "Without --agent: every installed, enabled agent. Per-agent switches set in the app are honoured.",
      ],
      run: deploy,
    },
    {
      name: "undeploy",
      summary: "Remove a preset's skills from agents",
      usage: "<name> [--agent <key>…]",
      flags: [AGENT_FLAG],
      notes: ["Without --agent: every agent that currently holds one of its skills."],
      run: undeploy,
    },
  ],
};
