import { APP_NAME, CLI_BINARY_NAME } from "@loadout/shared";
import type { FlagSpec } from "./args";
import type { CommandGroup, CommandSpec } from "./commands";

const INDENT = "  ";
const GAP = 2;

export const GLOBAL_FLAGS: readonly FlagSpec[] = [
  {
    name: "json",
    type: "boolean",
    description: "Machine-readable output: the result on stdout, errors as JSON on stderr.",
  },
  {
    name: "library",
    type: "string",
    value: "path",
    description: "Work on the library in this base folder instead of the saved one.",
  },
  {
    name: "help",
    short: "h",
    type: "boolean",
    description: "Show help for the tool, a group or a command.",
  },
  { name: "version", short: "V", type: "boolean", description: "Print the version." },
];

const SKILL_REF_NOTE = "<ref> is a skill id, its name, or its folder name in the library.";
const EXIT_NOTE = "Exit codes: 0 done, 1 failed, 2 wrong usage.";

function columns(rows: readonly (readonly [string, string])[]): string[] {
  const width = Math.max(0, ...rows.map(([left]) => left.length)) + GAP;
  return rows.map(([left, right]) => `${INDENT}${left.padEnd(width)}${right}`);
}

function flagLabel(flag: FlagSpec): string {
  const names = flag.short ? `-${flag.short}, --${flag.name}` : `--${flag.name}`;
  return flag.type === "boolean" ? names : `${names} <${flag.value ?? "value"}>`;
}

const flagRows = (flags: readonly FlagSpec[]): string[] =>
  columns(
    flags
      .filter((flag) => !flag.hidden)
      .map((flag) => [flagLabel(flag), flag.description] as const),
  );

/** `--agent <key>…`: how a flag is written in a usage line. */
function flagUsage(flag: FlagSpec): string {
  if (flag.type === "boolean") return `--${flag.name}`;
  return `--${flag.name} <${flag.value ?? "value"}>${flag.type === "list" ? "…" : ""}`;
}

/** The usage text names the flag already, e.g. as part of `<ref>… | --all`, or as `-m`. */
export function usageNames(usage: string, flag: FlagSpec): boolean {
  const spellings = [`--${flag.name}`, ...(flag.short ? [`-${flag.short}`] : [])];
  return spellings.some((spelling) => new RegExp(`(^|[^\\w-])${spelling}(?![\\w-])`).test(usage));
}

/**
 * A command's whole usage line: its own text (arguments, and flags that only make sense together),
 * then every other flag from its specs, so the line cannot drift from what the command accepts.
 */
export function commandUsage(command: CommandSpec): string {
  const visible = command.flags.filter((flag) => !flag.hidden);
  const paired = new Set(visible.flatMap((flag) => flag.requiredUnless ?? []));
  const parts = [command.usage];
  for (const flag of visible) {
    if (usageNames(command.usage, flag) || paired.has(flag.name)) continue;
    parts.push(
      flag.requiredUnless
        ? `(--${flag.requiredUnless} | ${flagUsage(flag)})`
        : `[${flagUsage(flag)}]`,
    );
  }
  return parts.join(" ").trim();
}

export function rootHelp(groups: readonly CommandGroup[]): string {
  return [
    `${APP_NAME} - manage AI agent skills from the command line.`,
    "",
    `Usage: ${CLI_BINARY_NAME} <group> <command> [arguments] [options]`,
    "",
    "Groups:",
    ...columns(groups.map((group) => [group.name, group.summary] as const)),
    "",
    "Options:",
    ...flagRows(GLOBAL_FLAGS),
    "",
    `Run \`${CLI_BINARY_NAME} <group> --help\` to see a group's commands.`,
    EXIT_NOTE,
  ].join("\n");
}

export function groupHelp(group: CommandGroup): string {
  return [
    `${CLI_BINARY_NAME} ${group.name} - ${group.summary}`,
    "",
    "Commands:",
    ...columns(
      group.commands
        .filter((c) => !c.hidden)
        .map((c) => [`${c.name} ${commandUsage(c)}`.trim(), c.summary] as const),
    ),
    "",
    `Run \`${CLI_BINARY_NAME} ${group.name} <command> --help\` for details.`,
  ].join("\n");
}

export function commandHelp(group: CommandGroup, command: CommandSpec): string {
  const invocation =
    group.standalone === command
      ? `${CLI_BINARY_NAME} ${group.name}`
      : `${CLI_BINARY_NAME} ${group.name} ${command.name}`;
  const lines = [
    `${invocation} - ${command.summary}`,
    "",
    `Usage: ${invocation} ${commandUsage(command)}`.trimEnd(),
  ];
  if (command.flags.some((flag) => !flag.hidden)) {
    lines.push("", "Options:", ...flagRows(command.flags));
  }
  lines.push("", "Global options:", ...flagRows(GLOBAL_FLAGS));
  const notes = [...(command.notes ?? [])];
  if (command.usage.includes("<ref>")) notes.push(SKILL_REF_NOTE);
  if (notes.length > 0) lines.push("", ...notes);
  return lines.join("\n");
}
