import { notFound } from "@skillboard/core";
import { flagBoolean } from "../args";
import { plural, table } from "../output";
import { limitPositionals, positionalsFrom } from "./support";
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

function switcher(enabled: boolean) {
  return async ({ core, args }: CommandContext): Promise<CommandResult> => {
    const keys = [...new Set(positionalsFrom(args, 0, "an agent key"))];
    const before = new Map((await core.api.agents.list()).map((agent) => [agent.key, agent]));
    // Check every key first: a typo must not leave half of the request applied.
    const unknown = keys.find((key) => !before.has(key));
    if (unknown !== undefined) throw notFound(`Unknown agent: ${unknown}`);
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
      usage: "<key>…",
      flags: [],
      notes: ["Disabling an agent also removes every skill this tool deployed to it."],
      run: switcher(false),
    },
  ],
};
