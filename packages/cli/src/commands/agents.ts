import { notFound } from "@loadout/core";
import { flagBoolean } from "../args";
import { plural, table } from "../output";
import { listingCommand } from "./agents-listing";
import { DRY_RUN_FLAG, limitPositionals, positionalsFrom, requireYes, yesFlag } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const INSTALLED_FLAG = {
  name: "installed",
  type: "boolean",
  description: "Only agents found on this machine.",
} as const;
const DISABLE_YES_FLAG = yesFlag(
  "Confirm removing the skills deployed to these agents. Needed only when there are any.",
);

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
    const agents = keys.map((key) => ({
      agent: key,
      enabled,
      changed: before.get(key)?.enabled !== enabled,
    }));
    const changedCount = agents.filter((entry) => entry.changed).length;
    const state = enabled ? "enabled" : "disabled";
    const summary = `${plural(changedCount, "agent")} ${state}, ${keys.length - changedCount} already ${state}.`;
    const apply = async (): Promise<void> => {
      for (const entry of agents) {
        if (entry.changed) await core.api.agents.setEnabled(entry.agent, enabled);
      }
    };
    if (enabled) {
      await apply();
      return { value: { agents }, text: summary };
    }
    // What switching each agent off takes away, as core works it out, before anything changes.
    const losing = new Map<string, string[]>();
    for (const key of keys) {
      const { removed } = await core.api.agents.setEnabled(key, false, { dryRun: true });
      if (removed.length > 0) losing.set(key, removed);
    }
    const count = [...losing.values()].reduce((sum, names) => sum + names.length, 0);
    if (count > 0) {
      requireYes(
        args,
        `remove ${plural(count, "deployed skill")} from ${[...losing.keys()].join(", ")}`,
      );
    }
    // A dry run never writes, whether or not the agents have anything deployed.
    if (flagBoolean(args, DRY_RUN_FLAG.name)) {
      const lines = [...losing].map(([agent, names]) => `  ${agent}: ${names.join(", ")}`);
      return {
        value: { dryRun: true, agents, removed: Object.fromEntries(losing) },
        text: [
          count > 0
            ? `Would remove ${plural(count, "deployed skill")}:`
            : "Would remove no deployed skills.",
          ...lines,
          "Nothing was changed.",
        ].join("\n"),
      };
    }
    await apply();
    return { value: { dryRun: false, agents, removed: Object.fromEntries(losing) }, text: summary };
  };
}

export const agentsGroup: CommandGroup = {
  name: "agents",
  summary: "The AI tools skills are deployed to",
  commands: [
    {
      name: "list",
      summary: "List known agents, their state and skills folder",
      usage: "",
      flags: [INSTALLED_FLAG],
      readOnly: true,
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
      flags: [DRY_RUN_FLAG, DISABLE_YES_FLAG],
      notes: [
        "Disabling an agent also removes every skill this tool deployed to it, so it asks for --yes when it has any. Preview with --dry-run.",
      ],
      run: switcher(false),
    },
    listingCommand,
  ],
};
