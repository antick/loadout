import {
  ITEM_KINDS,
  LISTING_WINDOW_CHOICES,
  NEW_SKILL_TEMPLATES,
  SOURCE_TYPES,
} from "@loadout/shared";
import type { FlagSpec } from "../args";
import type { CommandGroup, CommandSpec } from "../commands/types";

/**
 * What a shell completes for a flag's value or a positional argument. `skills`, `agents`,
 * `presets` and `tags` are asked of the library at the moment of completing (`completion words`),
 * `files` are paths, `choice` a fixed list.
 */
export type WordKind = "skills" | "agents" | "presets" | "tags" | "files" | "none";

/** Kinds the library is asked for when completing. */
export const LIBRARY_WORD_KINDS = ["skills", "agents", "presets", "tags"] as const;
export type LibraryWordKind = (typeof LIBRARY_WORD_KINDS)[number];

export interface CompletionFlag {
  /** Every spelling: `--name` and `-x`. */
  spellings: string[];
  takesValue: boolean;
  /** For flags that take a value. */
  kind: WordKind;
  /** A fixed set of values, e.g. `--source`. */
  choices?: readonly string[];
}

export interface CompletionCommand {
  /** `group command`, or just `group` for a group that is one command. */
  path: string;
  flags: CompletionFlag[];
  /** What each positional argument is; the last one repeats when `repeats` is set. */
  positionals: WordKind[];
  repeats: boolean;
}

export interface CompletionSpec {
  groups: string[];
  /** Group name → its command names (empty for a group that is one command). */
  commands: Map<string, string[]>;
  /** Flags that may come before the group: `--json`, `--library`, … */
  globals: CompletionFlag[];
  byPath: Map<string, CompletionCommand>;
}

/** Value placeholder of a flag → what to complete. Anything else is free text. */
const VALUE_KINDS: Readonly<Record<string, WordKind>> = {
  key: "agents",
  agent: "agents",
  tag: "tags",
  path: "files",
  file: "files",
  dir: "files",
  preset: "presets",
};

/** Fixed values of a flag, by its value placeholder (`--source <type>` in `skills list`). */
const VALUE_CHOICES: Readonly<Record<string, readonly string[]>> = {
  type: SOURCE_TYPES,
  kind: ITEM_KINDS,
  template: NEW_SKILL_TEMPLATES,
  window: LISTING_WINDOW_CHOICES,
};

/** A positional placeholder in a usage line → what to complete. */
const POSITIONAL_KINDS: Readonly<Record<string, WordKind>> = {
  ref: "skills",
  key: "agents",
  tag: "tags",
  path: "files",
  dir: "files",
  source: "files",
  file: "files",
};

/** In the presets group, `<name>` is a preset. */
const PRESET_GROUP = "presets";
const USAGE_ARGUMENT = /^<([a-z-]+)>(…)?$/;
const REPEAT_MARK = "…";

function toFlag(flag: FlagSpec): CompletionFlag {
  const spellings = [`--${flag.name}`, ...(flag.short ? [`-${flag.short}`] : [])];
  const takesValue = flag.type !== "boolean";
  const choices = takesValue ? VALUE_CHOICES[flag.value ?? ""] : undefined;
  return {
    spellings,
    takesValue,
    kind: takesValue ? (VALUE_KINDS[flag.value ?? ""] ?? "none") : "none",
    ...(choices ? { choices } : {}),
  };
}

/**
 * The positional arguments of a usage line such as `<name> <ref>… [--agent <key>…]`: the
 * `<…>` words before the first option or alternative.
 */
export function positionalsOf(
  group: string,
  usage: string,
): { positionals: WordKind[]; repeats: boolean } {
  const positionals: WordKind[] = [];
  let repeats = false;
  for (const word of usage.split(/\s+/)) {
    const match = USAGE_ARGUMENT.exec(word);
    if (!match?.[1]) break;
    const name = match[1];
    const kind = group === PRESET_GROUP && name === "name" ? "presets" : POSITIONAL_KINDS[name];
    positionals.push(kind ?? "none");
    if (match[2] === REPEAT_MARK) {
      repeats = true;
      break;
    }
  }
  return { positionals, repeats };
}

function toCommand(
  group: CommandGroup,
  command: CommandSpec,
  globals: CompletionFlag[],
): CompletionCommand {
  const path = group.standalone === command ? group.name : `${group.name} ${command.name}`;
  return {
    path,
    flags: [...command.flags.map(toFlag), ...globals],
    ...positionalsOf(group.name, command.usage),
  };
}

/** Everything a completion script needs, read from the command definitions. */
export function completionSpec(
  groups: readonly CommandGroup[],
  globalFlags: readonly FlagSpec[],
): CompletionSpec {
  const globals = globalFlags.map(toFlag);
  const byPath = new Map<string, CompletionCommand>();
  const commands = new Map<string, string[]>();
  for (const group of groups) {
    if (group.standalone) {
      commands.set(group.name, []);
      byPath.set(group.name, toCommand(group, group.standalone, globals));
      continue;
    }
    const shown = group.commands.filter((command) => !command.hidden);
    commands.set(
      group.name,
      shown.map((command) => command.name),
    );
    for (const command of shown) {
      const entry = toCommand(group, command, globals);
      byPath.set(entry.path, entry);
    }
  }
  return { groups: groups.map((group) => group.name), commands, globals, byPath };
}

/**
 * What to complete after each flag that takes a value, keyed by `<command path> <spelling>` (the
 * path is empty before a group is typed): one spelling may mean different things in two commands.
 */
export function valueKinds(spec: CompletionSpec): Map<string, CompletionFlag> {
  const kinds = new Map<string, CompletionFlag>();
  const add = (path: string, flags: readonly CompletionFlag[]): void => {
    for (const flag of flags) {
      if (!flag.takesValue) continue;
      for (const spelling of flag.spellings) kinds.set(`${path} ${spelling}`, flag);
    }
  };
  add("", spec.globals);
  for (const command of spec.byPath.values()) add(command.path, command.flags);
  return kinds;
}
