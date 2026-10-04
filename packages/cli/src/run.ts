import {
  type Core,
  type CoreCreateOptions,
  isLibraryDir,
  notFound,
  resolveLibrary,
  toErrorShape,
} from "@loadout/core";
import { APP_NAME, type ErrorShape } from "@loadout/shared";
import { UsageError, flagBoolean, flagString, parseArgs, splitCommandPath } from "./args";
import { COMMAND_GROUPS, type CommandGroup, type CommandSpec } from "./commands";
import { resolveUserPath } from "./commands/support";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "./exit-codes";
import type { SkillPicker } from "./picker/state";
import { GLOBAL_FLAGS, commandHelp, groupHelp, rootHelp } from "./help";
import { type CliIo, printCommandResult, printError } from "./output";

export interface CliDeps {
  createCore(options: CoreCreateOptions): Core;
  io: CliIo;
  version: string;
  cwd: string;
  homeDir: string;
  /** Extra options for every core this run opens (tests pin `homeDir`). */
  coreOptions?: CoreCreateOptions;
  /** Keyboard picker; given only when both ends are an interactive terminal. */
  picker?: SkillPicker;
}

export { EXIT_FAILED, EXIT_OK, EXIT_USAGE };

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

/** The library at `baseDir`, or the saved one, when it already exists. Never creates one. */
function openExistingLibrary(deps: CliDeps, baseDir: string | undefined): Core | null {
  const { paths, unavailable } = resolveLibrary({
    homeDir: deps.coreOptions?.homeDir ?? deps.homeDir,
    baseDir,
  });
  if (unavailable || !isLibraryDir(paths.baseDir)) return null;
  return deps.createCore({ ...deps.coreOptions, baseDir: paths.baseDir });
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
    const context = {
      args,
      cwd: deps.cwd,
      customLibrary: library !== undefined,
      ...(json || !deps.picker ? {} : { picker: deps.picker }),
    };
    let baseDir =
      library === undefined ? undefined : resolveUserPath(library, deps.cwd, deps.homeDir);
    if ("runWithoutLibrary" in command) {
      const openExisting = (): Core | null => {
        core ??= openExistingLibrary(deps, baseDir);
        return core;
      };
      const result = await command.runWithoutLibrary({
        ...context,
        homeDir: deps.homeDir,
        openExisting,
      });
      printCommandResult(io, json, result);
      return result.exitCode ?? EXIT_OK;
    }
    if (command.createsLibraryAt) {
      baseDir = command.createsLibraryAt(context, deps.homeDir);
    } else if (baseDir !== undefined && !isLibraryDir(baseDir)) {
      // A typo in --library must not quietly start an empty library somewhere.
      throw notFound(
        `There is no ${APP_NAME} library in ${baseDir}. Check the path, or create one with \`repo init ${library}\`.`,
      );
    }
    core = deps.createCore({ ...deps.coreOptions, ...(baseDir === undefined ? {} : { baseDir }) });
    const result = await command.run({ core, ...context });
    printCommandResult(io, json, result);
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
