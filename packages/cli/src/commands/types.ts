import type { Core } from "@loadout/core";
import type { FlagSpec, ParsedArgs } from "../args";

/** What a command hands back: the machine-readable value and the text a person reads. */
export interface CommandResult {
  value: unknown;
  text: string;
  /** Set when part of a batch failed: the value is still printed, the exit code says "look". */
  exitCode?: number;
}

export interface CommandContext {
  core: Core;
  args: ParsedArgs;
  /** Folder relative paths on the command line are resolved against. */
  cwd: string;
  /** True when `--library` points the run at another library. */
  customLibrary: boolean;
}

export interface CommandSpec {
  name: string;
  summary: string;
  /** Arguments after the command name, e.g. `<ref> --agent <key>…`. */
  usage: string;
  flags: readonly FlagSpec[];
  /** Extra lines shown under the options in `--help`. */
  notes?: readonly string[];
  run(context: CommandContext): Promise<CommandResult>;
}

export interface CommandGroup {
  name: string;
  summary: string;
  commands: readonly CommandSpec[];
  /** A group that is one command on its own, run as `loadout <group>` (e.g. `doctor`). */
  standalone?: CommandSpec;
}
