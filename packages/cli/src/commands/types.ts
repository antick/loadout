import type { Core } from "@loadout/core";
import type { FlagSpec, ParsedArgs } from "../args";
import type { SkillPicker } from "../picker/state";

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
  /**
   * Lets a person tick skills with the keyboard. Only there in an interactive terminal and
   * without `--json`, so scripts always get the same, non-interactive behaviour.
   */
  picker?: SkillPicker;
}

/** What a command that runs without opening the library gets. */
export interface FreeCommandContext extends Omit<CommandContext, "core"> {
  /** What `~` in a path on the command line stands for. */
  homeDir: string;
  /**
   * The saved library, or the one `--library` names, opened only when it already exists: null
   * otherwise. Never creates one. Closed by the caller.
   */
  openExisting(): Core | null;
}

interface CommandBase {
  name: string;
  summary: string;
  /** Arguments after the command name, e.g. `<ref> --agent <key>…`. */
  usage: string;
  flags: readonly FlagSpec[];
  /** Extra lines shown under the options in `--help`. */
  notes?: readonly string[];
  /**
   * The command makes a new library: run on one opened (and so created) at the folder this
   * returns, instead of the saved library or `--library`, which only open existing ones.
   */
  createsLibraryAt?(context: Omit<CommandContext, "core">, homeDir: string): string;
  /** Left out of help: plumbing for scripts, such as the words shell completion asks for. */
  hidden?: boolean;
}

/** Most commands: run on the opened library. */
export interface LibraryCommandSpec extends CommandBase {
  run(context: CommandContext): Promise<CommandResult>;
}

/** Runs before (or without) a library, such as printing a shell completion script. */
export interface FreeCommandSpec extends CommandBase {
  runWithoutLibrary(context: FreeCommandContext): Promise<CommandResult>;
}

export type CommandSpec = LibraryCommandSpec | FreeCommandSpec;

export interface CommandGroup {
  name: string;
  summary: string;
  commands: readonly CommandSpec[];
  /** A group that is one command on its own, run as `loadout <group>` (e.g. `doctor`). */
  standalone?: CommandSpec;
}
