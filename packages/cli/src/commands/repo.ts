import { existsSync, readdirSync, statSync } from "node:fs";
import { exists, isLibraryDir } from "@loadout/core";
import { APP_NAME } from "@loadout/shared";
import { UsageError } from "../args";
import { fields } from "../output";
import { limitPositionals, positional, resolveUserPath } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const MOVE_NOTE = `The library is moved the next time ${APP_NAME} (or this tool) starts.`;

async function show({ core }: CommandContext): Promise<CommandResult> {
  const [location, skills, presets] = await Promise.all([
    core.api.system.libraryLocation(),
    core.api.skills.list(),
    core.api.presets.list(),
  ]);
  const { paths } = core.ctx;
  const value = {
    ...location,
    skillsDir: paths.skillsDir,
    metadataDir: paths.metadataDir,
    databasePath: paths.dbPath,
    binDir: paths.binDir,
    skillCount: skills.length,
    presetCount: presets.length,
  };
  const text = fields([
    ["Library", value.path],
    ["Default location", value.defaultPath],
    ["Moves to", value.pendingPath],
    ["Skills folder", value.skillsDir],
    ["Database", value.databasePath],
    ["Skills", value.skillCount],
    ["Presets", value.presetCount],
    ["Warnings", value.warnings.join(", ")],
  ]);
  return { value, text };
}

/** Moving is always about the saved location, so it makes no sense for a one-off `--library`. */
function refuseCustomLibrary(context: Pick<CommandContext, "customLibrary">): void {
  if (context.customLibrary) {
    throw new UsageError("--library can not be combined with moving the saved library location.");
  }
}

/** Where `repo init` makes its library: a new or empty folder, never over an existing one. */
function initTarget(context: Omit<CommandContext, "core">, homeDir: string): string {
  refuseCustomLibrary(context);
  limitPositionals(context.args, 1);
  const target = resolveUserPath(
    positional(context.args, 0, "the folder for the new library"),
    context.cwd,
    homeDir,
  );
  if (isLibraryDir(target)) throw exists(`${target} already holds a ${APP_NAME} library.`);
  if (existsSync(target) && (!statSync(target).isDirectory() || readdirSync(target).length > 0)) {
    throw new UsageError(`${target} is not empty. Pick a new or empty folder.`);
  }
  return target;
}

async function init({ core }: CommandContext): Promise<CommandResult> {
  const path = core.ctx.paths.baseDir;
  return {
    value: { path, skillsDir: core.ctx.paths.skillsDir },
    text: `Created an empty library in ${path}.\nUse it with --library ${path}. To make it the saved library: repo set.`,
  };
}

async function set(context: CommandContext): Promise<CommandResult> {
  refuseCustomLibrary(context);
  limitPositionals(context.args, 1);
  const target = resolveUserPath(
    positional(context.args, 0, "the new library path"),
    context.cwd,
    context.core.ctx.homeDir,
  );
  const value = await context.core.api.system.setLibraryPath(target);
  return { value, text: `Library location set to ${target}.\n${MOVE_NOTE}` };
}

async function reset(context: CommandContext): Promise<CommandResult> {
  refuseCustomLibrary(context);
  limitPositionals(context.args, 0);
  const value = await context.core.api.system.setLibraryPath(null);
  return { value, text: `Library location reset to ${value.defaultPath}.\n${MOVE_NOTE}` };
}

export const repoGroup: CommandGroup = {
  name: "repo",
  summary: "Where the skill library lives",
  commands: [
    {
      name: "show",
      summary: "Show the library location and counts",
      usage: "",
      flags: [],
      run: show,
    },
    {
      name: "set",
      summary: "Move the library to another folder (on next start)",
      usage: "<path>",
      flags: [],
      notes: ["The target must be empty or not exist yet."],
      run: set,
    },
    {
      name: "init",
      summary: "Create a new, empty library in a folder",
      usage: "<path>",
      flags: [],
      notes: [
        "The folder must be new or empty. --library only opens libraries that exist; this is how to make one.",
        "It does not change the saved library: pass --library <path> to use it.",
      ],
      createsLibraryAt: initTarget,
      run: init,
    },
    {
      name: "reset",
      summary: "Move the library back to the default folder",
      usage: "",
      flags: [],
      run: reset,
    },
  ],
};
