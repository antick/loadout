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
  columns(flags.map((flag) => [flagLabel(flag), flag.description] as const));

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
    ...columns(group.commands.map((c) => [`${c.name} ${c.usage}`.trim(), c.summary] as const)),
    "",
    `Run \`${CLI_BINARY_NAME} ${group.name} <command> --help\` for details.`,
  ].join("\n");
}

export function commandHelp(group: CommandGroup, command: CommandSpec): string {
  const lines = [
    `${CLI_BINARY_NAME} ${group.name} ${command.name} - ${command.summary}`,
    "",
    `Usage: ${CLI_BINARY_NAME} ${group.name} ${command.name} ${command.usage}`.trimEnd(),
  ];
  if (command.flags.length > 0) lines.push("", "Options:", ...flagRows(command.flags));
  lines.push("", "Global options:", ...flagRows(GLOBAL_FLAGS));
  const notes = [...(command.notes ?? [])];
  if (command.usage.includes("<ref>")) notes.push(SKILL_REF_NOTE);
  if (notes.length > 0) lines.push("", ...notes);
  return lines.join("\n");
}
