import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { notFound } from "@loadout/core";
import {
  type FoundItem,
  type ItemFormat,
  type ItemSource,
  exportItem,
  importItem,
  isItemKind,
  itemTargetFor,
} from "@loadout/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { plural, table } from "../output";
import { KIND_FLAG, kindFlag, refText, warningLines } from "./items-support";
import {
  DRY_RUN_FLAG,
  OVERWRITE_FLAG,
  limitPositionals,
  positional,
  refuseOverwrite,
  resolveUserPath,
} from "./support";
import type {
  CommandContext,
  CommandResult,
  FreeCommandContext,
  FreeCommandSpec,
  LibraryCommandSpec,
} from "./types";

const ITEM_FLAG = {
  name: "item",
  short: "i",
  type: "list",
  value: "kind/name",
  description: "Item to import, like subagent/reviewer. Repeat for several.",
} as const;
const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every item found that the library does not already hold as it is.",
} as const;
const REPLACE_FLAG = {
  name: "replace",
  type: "boolean",
  description: "Replace library items of the same name.",
} as const;

const AGENTS_SOURCE = "agents";
const GIT_URL = /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)|^[\w.-]+\/[\w.-]+(#.*)?$/;

/** `agents`, a folder, or a Git URL / `owner/repo`. */
function sourceOf(input: string, context: CommandContext): ItemSource {
  if (input === AGENTS_SOURCE) return { type: "agents" };
  const path = resolveUserPath(input, context.cwd, context.core.ctx.homeDir);
  if (existsSync(path)) return { type: "folder", path };
  if (GIT_URL.test(input)) return { type: "git", url: input };
  throw notFound(`No folder at ${path}, and it does not look like a Git repository.`);
}

async function found(context: CommandContext): Promise<FoundItem[]> {
  const input = positional(context.args, 0, "where to look: agents, a folder, or a Git URL");
  limitPositionals(context.args, 1);
  const kind = kindFlag(context);
  const items = await context.core.api.items.find(sourceOf(input, context));
  return kind ? items.filter((item) => item.kind === kind) : items;
}

async function find(context: CommandContext): Promise<CommandResult> {
  const items = await found(context);
  const text = table(
    ["KIND", "NAME", "STATUS", "FOUND AT", "NOTES"],
    items.map((item) => [item.kind, item.name, item.status, item.path, item.warnings.length || ""]),
    "No subagents, commands or rules found there.",
  );
  return { value: items, text };
}

async function importItems(context: CommandContext): Promise<CommandResult> {
  const { args, core } = context;
  const items = await found(context);
  const wanted = flagList(args, ITEM_FLAG.name).map((ref) => ref.replace(/^(\w+?)s\//, "$1/"));
  const all = flagBoolean(args, ALL_FLAG.name);
  if (all === wanted.length > 0) throw new UsageError("Give --item for each item, or --all.");
  const picked = all
    ? items.filter((item) => item.status !== "same")
    : wanted.map((ref) => {
        const match = items.find((item) => refText(item) === ref);
        if (!match)
          throw notFound(`${ref} was not found there. Run \`items find\` to see what is.`);
        return match;
      });
  const replace = flagBoolean(args, REPLACE_FLAG.name);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const lines = picked.map(
      (item) =>
        `${refText(item)}: ${item.status === "new" ? "would import" : replace ? "would replace the library's" : "skipped, the library has one"}`,
    );
    return {
      value: { dryRun: true, items: picked },
      text: lines.join("\n") || "Nothing to import.",
    };
  }
  const result = await core.api.items.importItems(picked, { replace });
  const lines = [
    `Imported ${plural(result.imported.length, "item")}${result.replaced.length ? `, replaced ${result.replaced.length}` : ""}.`,
    ...result.skipped.map(
      (ref) => `Skipped ${refText(ref)}: the library has one. Add --replace to take this one.`,
    ),
  ];
  for (const item of picked) {
    if (item.warnings.length > 0) lines.push(`${refText(item)}:`, ...warningLines(item.warnings));
  }
  return { value: { dryRun: false, ...result }, text: lines.join("\n") };
}

export const findCommand: LibraryCommandSpec = {
  name: "find",
  summary: "Look for items in agents' folders, a folder or a Git repository",
  usage: "<agents | folder | git-url>",
  flags: [KIND_FLAG],
  notes: [
    "`agents` looks in every installed agent's own folders, leaving out files Loadout wrote.",
  ],
  run: find,
};

export const importCommand: LibraryCommandSpec = {
  name: "import",
  summary: "Copy found items into the library, in its format",
  usage: "<agents | folder | git-url> (--item <kind/name>… | --all)",
  flags: [ITEM_FLAG, ALL_FLAG, REPLACE_FLAG, KIND_FLAG, DRY_RUN_FLAG],
  run: importItems,
};

const TO_FLAG = {
  name: "to",
  type: "string",
  value: "agent",
  description: "Agent whose format to write. Default: the library's (Claude Code's).",
} as const;
const FROM_FLAG = {
  name: "from",
  type: "string",
  value: "agent",
  description: "Agent whose format the file is in. Default: the library's (Claude Code's).",
} as const;
const OUT_FLAG = {
  name: "out",
  short: "o",
  type: "string",
  value: "file",
  description: "Write the result here instead of printing it.",
} as const;

function formatFor(kindText: string, agentKey: string | undefined): ItemFormat {
  if (agentKey === undefined) return "claude";
  if (!isItemKind(kindText)) throw new UsageError("Give --kind.");
  const target = itemTargetFor(kindText, agentKey);
  if (!target) throw new UsageError(`${agentKey} does not read ${kindText}s.`);
  return target.format;
}

/** Convert one file between agent formats. Needs no library. */
async function convert(context: FreeCommandContext): Promise<CommandResult> {
  const { args } = context;
  const input = positional(args, 0, "the file to convert");
  limitPositionals(args, 1);
  const kind = flagString(args, KIND_FLAG.name);
  if (!kind || !isItemKind(kind)) throw new UsageError("Give --kind: subagent, command or rule.");
  const file = resolveUserPath(input, context.cwd, context.homeDir);
  if (!existsSync(file)) throw notFound(`No file at ${file}`);
  const from = formatFor(kind, flagString(args, FROM_FLAG.name));
  const to = formatFor(kind, flagString(args, TO_FLAG.name));
  const imported = importItem(from, readFileSync(file, "utf8"));
  const name = file.replace(/\\/g, "/").split("/").pop()?.split(".")[0] ?? "item";
  const exported = exportItem(kind, name, imported.content, to);
  const warnings = [...imported.warnings, ...exported.warnings];
  const out = flagString(args, OUT_FLAG.name);
  if (out === undefined)
    return { value: { content: exported.content, warnings }, text: exported.content.trimEnd() };
  const target = resolveUserPath(out, context.cwd, context.homeDir);
  refuseOverwrite(args, target);
  writeFileSync(target, exported.content);
  return {
    value: { path: target, warnings },
    text: [`Wrote ${target}`, ...warningLines(warnings)].join("\n"),
  };
}

export const convertCommand: FreeCommandSpec = {
  name: "convert",
  summary: "Convert a subagent, command or rule file between agents' formats",
  usage: "<file> --kind <kind>",
  flags: [KIND_FLAG, FROM_FLAG, TO_FLAG, OUT_FLAG, OVERWRITE_FLAG],
  notes: ["Needs no library. With --json, also lists what the conversion could not carry over."],
  runWithoutLibrary: convert,
};
