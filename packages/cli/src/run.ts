import { type Core, type CoreCreateOptions, toErrorShape } from "@loadout/core";
import type { ErrorShape } from "@loadout/shared";
import { UsageError, flagBoolean, flagString, parseArgs, splitCommandPath } from "./args";
import { COMMAND_GROUPS, type CommandGroup, type CommandSpec } from "./commands";
import { resolveUserPath } from "./commands/support";
import { GLOBAL_FLAGS, commandHelp, groupHelp, rootHelp } from "./help";
import { type CliIo, printError, printResult } from "./output";

export interface CliDeps {
  createCore(options: CoreCreateOptions): Core;
  io: CliIo;
  version: string;
  cwd: string;
  homeDir: string;
  /** Extra options for every core this run opens (tests pin `homeDir` and `configDir`). */
  coreOptions?: CoreCreateOptions;
}

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;
const COMMAND_DEPTH = 2;
const JSON_FLAG = "--json";

function usageShape(message: string): ErrorShape {
  return { code: "INVALID_INPUT", message };
}

function findCommand(path: readonly string[]): { group?: CommandGroup; command?: CommandSpec } {
  const [groupName, commandName] = path;
  const group = COMMAND_GROUPS.find((candidate) => candidate.name === groupName);
  if (group?.standalone) {
    if (commandName !== undefined) throw new UsageError(`Unexpected argument: ${commandName}`);
    return { group, command: group.standalone };
  }
  const command = group?.commands.find((candidate) => candidate.name === commandName);
  return { group, command };
}

function helpFor(group: CommandGroup | undefined, command: CommandSpec | undefined): string {
  if (!group) return rootHelp(COMMAND_GROUPS);
  return command ? commandHelp(group, command) : groupHelp(group);
}

/** Run one invocation. Never throws and never exits the process: the caller owns both. */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const { io } = deps;
  // Known before parsing, so even a parse error is reported in the format the caller asked for.
  let json = argv.includes(JSON_FLAG);
  let core: Core | null = null;
  try {
    const { path, rest } = splitCommandPath(argv, GLOBAL_FLAGS, COMMAND_DEPTH);
    const { group, command } = findCommand(path);
    const args = parseArgs(rest, [...GLOBAL_FLAGS, ...(command?.flags ?? [])]);
    json = flagBoolean(args, "json");

    if (flagBoolean(args, "version") && path.length === 0) {
      io.stdout(`${json ? JSON.stringify({ version: deps.version }) : deps.version}\n`);
      return EXIT_OK;
    }
    if (flagBoolean(args, "help") || path.length === 0) {
      if (path.length > 0 && !group) throw new UsageError(`Unknown group: ${path[0]}`);
      io.stdout(`${helpFor(group, command)}\n`);
      return EXIT_OK;
    }
    if (!group)
      throw new UsageError(`Unknown group: ${path[0]}. Run with --help to see the groups.`);
    if (!command) {
      const given = path[1];
      throw new UsageError(
        given === undefined
          ? `Missing command. Run \`${group.name} --help\` to see what it offers. Options go after the command.`
          : `Unknown command: ${group.name} ${given}. Run \`${group.name} --help\` to see what it offers.`,
      );
    }

    const library = flagString(args, "library");
    core = deps.createCore({
      ...deps.coreOptions,
      ...(library === undefined
        ? {}
        : { baseDir: resolveUserPath(library, deps.cwd, deps.homeDir) }),
    });
    const result = await command.run({
      core,
      args,
      cwd: deps.cwd,
      customLibrary: library !== undefined,
    });
    printResult(io, json, result.value, result.text);
    return result.exitCode ?? EXIT_OK;
  } catch (error) {
    if (error instanceof UsageError) {
      printError(io, json, usageShape(error.message));
      return EXIT_USAGE;
    }
    const shape = toErrorShape(error);
    printError(io, json, shape);
    return EXIT_FAILED;
  } finally {
    try {
      core?.close();
    } catch {
      // The outcome is already printed; a failing close must not change the exit code.
    }
  }
}
