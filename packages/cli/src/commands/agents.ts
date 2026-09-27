import { notFound } from "@loadout/core";
import { flagBoolean } from "../args";
import { plural, table } from "../output";
import { DRY_RUN_FLAG, YES_FLAG, limitPositionals, positionalsFrom, requireYes } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const INSTALLED_FLAG = {
  name: "installed",
  type: "boolean",
  description: "Only agents found on this machine.",
} as const;

async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const all = await core.api.agents.list();
  const value = flagBoolean(args, INSTALLED_FLAG.name) ? all.filter((a) => a.installed) : all;
  const text = table(
    ["key", "name", "installed", "enabled", "skills folder"],
    value.map((a) => [a.key, a.displayName, a.installed, a.enabled, a.skillsDir]),
    "No agents.",
  );
  return { value, text };
}

/** Skills deployed to each of `keys`, by agent: what disabling them takes away. */
function deployedTo(core: CommandContext["core"], keys: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const skill of core.store.list()) {
    for (const deployment of skill.deployments) {
      if (!keys.includes(deployment.agentKey)) continue;
      found.set(deployment.agentKey, [...(found.get(deployment.agentKey) ?? []), skill.name]);
    }
  }
  return found;
}

function switcher(enabled: boolean) {
  return async ({ core, args }: CommandContext): Promise<CommandResult> => {
    const keys = [...new Set(positionalsFrom(args, 0, "an agent key"))];
    const before = new Map((await core.api.agents.list()).map((agent) => [agent.key, agent]));
    // Check every key first: a typo must not leave half of the request applied.
    const unknown = keys.find((key) => !before.has(key));
    if (unknown !== undefined) throw notFound(`Unknown agent: ${unknown}`);
    if (!enabled) {
      const losing = deployedTo(
        core,
        keys.filter((key) => before.get(key)?.enabled),
      );
      if (losing.size > 0) {
        const count = [...losing.values()].reduce((sum, names) => sum + names.length, 0);
        requireYes(
          args,
          `remove ${plural(count, "deployed skill")} from ${[...losing.keys()].join(", ")}`,
        );
        if (flagBoolean(args, DRY_RUN_FLAG.name)) {
          const lines = [...losing].map(([agent, names]) => `  ${agent}: ${names.join(", ")}`);
          return {
            value: { dryRun: true, wouldRemove: Object.fromEntries(losing) },
            text: [
              `Would remove ${plural(count, "deployed skill")}:`,
              ...lines,
              "Nothing was changed.",
            ].join("\n"),
          };
        }
      }
    }
    const value = [];
    for (const key of keys) {
      const changed = before.get(key)?.enabled !== enabled;
      if (changed) await core.api.agents.setEnabled(key, enabled);
      value.push({ agent: key, enabled, changed });
    }
    const changedCount = value.filter((entry) => entry.changed).length;
    const text = `${plural(changedCount, "agent")} ${enabled ? "enabled" : "disabled"}, ${keys.length - changedCount} already ${enabled ? "enabled" : "disabled"}.`;
    return { value, text };
  };
}

export const agentsGroup: CommandGroup = {
  name: "agents",
  summary: "The AI tools skills are deployed to",
  commands: [
    {
      name: "list",
      summary: "List known agents, their state and skills folder",
      usage: "[--installed]",
      flags: [INSTALLED_FLAG],
      run: list,
    },
    {
      name: "enable",
      summary: "Switch agents on",
      usage: "<key>…",
      flags: [],
      run: switcher(true),
    },
    {
      name: "disable",
      summary: "Switch agents off",
      usage: "<key>… [--dry-run] [--yes]",
      flags: [DRY_RUN_FLAG, YES_FLAG],
      notes: [
        "Disabling an agent also removes every skill this tool deployed to it, so it asks for --yes when it has any. Preview with --dry-run.",
      ],
      run: switcher(false),
    },
  ],
};
