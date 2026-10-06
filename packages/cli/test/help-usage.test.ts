import { describe, expect, it } from "vitest";
import { COMMAND_GROUPS, type CommandSpec } from "../src/commands";
import type { FlagSpec } from "../src/args";
import { GLOBAL_FLAGS, commandUsage } from "../src/help";

/** Every command with the words that run it. */
const commands: { path: string; command: CommandSpec }[] = COMMAND_GROUPS.flatMap((group) =>
  [...group.commands, ...(group.standalone ? [group.standalone] : [])].map((command) => ({
    path: group.standalone === command ? group.name : `${group.name} ${command.name}`,
    command,
  })),
);

/** The usage line names the flag, as `--name` or as `-s`, as a whole word. */
const usageNames = (usage: string, flag: FlagSpec): boolean =>
  [`--${flag.name}`, ...(flag.short ? [`-${flag.short}`] : [])].some((spelling) =>
    new RegExp(`(^|[^\\w-])${spelling}(?![\\w-])`).test(usage),
  );

const find = (path: string): CommandSpec => {
  const found = commands.find((entry) => entry.path === path);
  if (!found) throw new Error(`No command ${path}`);
  return found.command;
};

describe("usage lines", () => {
  it("name only flags the command accepts", () => {
    for (const { path, command } of commands) {
      const known = [...command.flags.filter((flag) => !flag.hidden), ...GLOBAL_FLAGS];
      for (const [token] of command.usage.matchAll(/(?<![\w-])--?[a-zA-Z][\w-]*/g)) {
        const named = known.some(
          (flag) => token === `--${flag.name}` || token === `-${flag.short}`,
        );
        expect(named, `${path}: ${token}`).toBe(true);
      }
    }
  });

  it("show every flag the command accepts, and no hidden one", () => {
    for (const { path, command } of commands) {
      const usage = commandUsage(command);
      for (const flag of command.flags) {
        expect(usageNames(usage, flag), `${path} --${flag.name}`).toBe(flag.hidden !== true);
      }
    }
  });

  it("show --yes as needed where a command always needs it, and optional elsewhere", () => {
    expect(commandUsage(find("skills remove"))).toBe("<ref>… (--dry-run | --yes)");
    expect(commandUsage(find("removed delete"))).toBe("<id> (--dry-run | --yes)");
    expect(commandUsage(find("agents disable"))).toBe("<key>… [--dry-run] [--yes]");
    expect(commandUsage(find("presets undeploy"))).toBe("<name> [--agent <key>…] [--dry-run]");
    expect(commandUsage(find("doctor"))).toBe("[--all]");
  });
});

describe("read-only commands", () => {
  it("are the ones that only read, never one that can install or change anything", () => {
    const readOnly = commands
      .filter((entry) => entry.command.readOnly === true)
      .map((entry) => entry.path);
    // Its picker installs what is ticked.
    expect(readOnly).not.toContain("skills search");
    expect(readOnly).toEqual(expect.arrayContaining(["repo show", "sources list"]));
  });
});
