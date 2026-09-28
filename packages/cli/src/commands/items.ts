import { isAppError } from "@loadout/core";
import type { ItemRemovalResult, LibraryItem } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { plural, table } from "../output";
import { convertCommand, findCommand, importCommand } from "./items-import";
import {
  KIND_FLAG,
  PROJECT_FLAG,
  kindFlag,
  placesOf,
  projectFlag,
  refText,
  resolveItem,
  warningLines,
} from "./items-support";
import {
  AGENT_FLAG,
  DRY_RUN_FLAG,
  YES_FLAG,
  limitPositionals,
  positional,
  requireYes,
} from "./support";
import type { CommandContext, CommandGroup, CommandResult, CommandSpec } from "./types";

const REPLACE_FLAG = {
  name: "replace",
  type: "boolean",
  description: "Replace a file Loadout did not write; the old one is kept as <file>.loadout-old.",
} as const;

function where(item: LibraryItem): string {
  if (item.deployments.length === 0) return "not deployed";
  return item.deployments
    .map(
      (d) =>
        `${d.agentKey}${d.projectId ? " (project)" : ""}${d.state === "in_sync" ? "" : `: ${d.state}`}`,
    )
    .join(", ");
}

async function list(context: CommandContext): Promise<CommandResult> {
  limitPositionals(context.args, 0);
  const items = await context.core.api.items.list(kindFlag(context));
  const text = table(
    ["KIND", "NAME", "DESCRIPTION", "DEPLOYED"],
    items.map((item) => [item.kind, item.name, item.description ?? "", where(item)]),
    "No subagents, commands or rules yet. Add one with `items create`, or `items import agents`.",
  );
  return { value: items, text };
}

async function show(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const ref = await resolveItem(core, positional(args, 0, "an item, like subagent/reviewer"));
  limitPositionals(args, 1);
  const agent = args.flags[AGENT_FLAG.name];
  const agentKey = Array.isArray(agent) ? agent[0] : undefined;
  if (agentKey === undefined) {
    const item = await core.api.items.get(ref);
    return { value: item, text: item.content.trimEnd() };
  }
  const preview = await core.api.items.preview(ref, {
    agentKey,
    projectId: await projectFlag(context),
  });
  const lines = [
    `# ${preview.path}${preview.occupied ? " (a file Loadout did not write is there)" : ""}`,
  ];
  lines.push(...warningLines(preview.warnings), "", preview.content.trimEnd());
  return { value: preview, text: lines.join("\n") };
}

async function create(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const text = positional(args, 0, "the new item, like command/commit");
  limitPositionals(args, 1);
  if (!text.includes("/")) throw new UsageError("Give the kind too, like command/commit.");
  const ref = await resolveItem(core, text);
  const item = await core.api.items.create(ref);
  const detail = await core.api.items.get(ref);
  return {
    value: item,
    text: `Created ${refText(item)}: ${detail.path}\nEdit it, then deploy it with \`items deploy ${refText(item)} --agent <key>\`.`,
  };
}

async function deploy(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const ref = await resolveItem(core, positional(args, 0, "an item"));
  limitPositionals(args, 1);
  const lines: string[] = [];
  const places = await placesOf(context, AGENT_FLAG.name, {
    link: true,
    onLinked: (path) => lines.push(`Linked ${path} as a project.`),
  });
  let failed = 0;
  let item: LibraryItem | null = null;
  for (const place of places) {
    try {
      const preview = await core.api.items.preview(ref, place);
      item = await core.api.items.deploy(ref, place, {
        replace: flagBoolean(args, REPLACE_FLAG.name),
      });
      lines.push(`${place.agentKey}: ${preview.path}`, ...warningLines(preview.warnings));
    } catch (error) {
      failed += 1;
      const reason = isAppError(error) || error instanceof Error ? error.message : String(error);
      lines.push(`${place.agentKey}: not deployed. ${reason}`);
    }
  }
  return { value: item, text: lines.join("\n"), exitCode: failed > 0 ? 1 : 0 };
}

function removalText(result: ItemRemovalResult): string[] {
  return [
    ...result.removed.map((path) => `Removed ${path}`),
    ...result.kept.map((path) => `Kept ${path}: it was changed there.`),
  ];
}

async function undeploy(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const ref = await resolveItem(core, positional(args, 0, "an item"));
  limitPositionals(args, 1);
  const results: ItemRemovalResult[] = [];
  for (const place of await placesOf(context, AGENT_FLAG.name)) {
    results.push(await core.api.items.undeploy(ref, place));
  }
  const merged = {
    removed: results.flatMap((r) => r.removed),
    kept: results.flatMap((r) => r.kept),
  };
  return { value: merged, text: removalText(merged).join("\n") || "Nothing to remove." };
}

async function remove(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const ref = await resolveItem(core, positional(args, 0, "an item"));
  limitPositionals(args, 1);
  const item = (await core.api.items.list(ref.kind)).find((each) => each.name === ref.name);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const files = item?.deployments.map((d) => d.path) ?? [];
    return {
      value: { dryRun: true, ref, files },
      text: [
        `Would delete ${refText(ref)} from the library, and ${plural(files.length, "deployed file")} unless changed there.`,
        ...files,
      ].join("\n"),
    };
  }
  requireYes(args, `delete ${refText(ref)} from the library and from every agent folder`);
  const result = await core.api.items.remove(ref);
  return { value: result, text: [`Deleted ${refText(ref)}.`, ...removalText(result)].join("\n") };
}

const itemCommands: CommandSpec[] = [
  {
    name: "list",
    summary: "Subagents, commands and rules in the library, and where they are deployed",
    usage: "[--kind <kind>]",
    flags: [KIND_FLAG],
    run: list,
  },
  {
    name: "show",
    summary: "Print an item, or the file one agent gets for it",
    usage: "<kind/name> [--agent <key> [--project <path>]]",
    flags: [AGENT_FLAG, PROJECT_FLAG],
    notes: ["With --agent, prints the converted file and anything the conversion left out."],
    run: show,
  },
  {
    name: "create",
    summary: "Start a new item from a template",
    usage: "<kind/name>",
    flags: [],
    run: create,
  },
  {
    name: "deploy",
    summary: "Write an item into agents' folders, converted for each",
    usage: "<kind/name> --agent <key>… [--project <path>] [--replace]",
    flags: [AGENT_FLAG, PROJECT_FLAG, REPLACE_FLAG],
    notes: ["A file Loadout did not write is never replaced, unless --replace."],
    run: deploy,
  },
  {
    name: "undeploy",
    summary: "Take an item out of agents' folders",
    usage: "<kind/name> --agent <key>… [--project <path>]",
    flags: [AGENT_FLAG, PROJECT_FLAG],
    notes: ["A file changed in the agent's folder stays there."],
    run: undeploy,
  },
  {
    name: "remove",
    summary: "Delete an item from the library and from every agent folder",
    usage: "<kind/name> [--dry-run] [--yes]",
    flags: [DRY_RUN_FLAG, YES_FLAG],
    run: remove,
  },
  findCommand,
  importCommand,
  convertCommand,
];

export const itemsGroup: CommandGroup = {
  name: "items",
  summary: "Subagents, slash commands and rules",
  commands: itemCommands,
};
