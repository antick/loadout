import type { Core } from "@loadout/core";
import { CLI_BINARY_NAME } from "@loadout/shared";
import { UsageError } from "../args";
import { type Shell, completionScript } from "../completion/scripts";
import { LIBRARY_WORD_KINDS, type LibraryWordKind, completionSpec } from "../completion/spec";
import { GLOBAL_FLAGS } from "../help";
import { limitPositionals, positional } from "./support";
import { COMMAND_GROUPS } from "./index";
import type { CommandGroup, CommandResult, FreeCommandContext, FreeCommandSpec } from "./types";

const isWordKind = (value: string): value is LibraryWordKind =>
  LIBRARY_WORD_KINDS.some((kind) => kind === value);

/** Sorted, without repeats or blanks. */
const tidy = (words: Iterable<string>): string[] =>
  [...new Set(words)].filter((word) => word.trim()).sort((a, b) => a.localeCompare(b));

async function wordsOf(core: Core, kind: LibraryWordKind): Promise<string[]> {
  if (kind === "agents") return tidy(core.registry.list().map((agent) => agent.key));
  if (kind === "presets") return tidy((await core.api.presets.list()).map((p) => p.name));
  const skills = await core.api.skills.list();
  return kind === "tags" ? tidy(skills.flatMap((s) => s.tags)) : tidy(skills.map((s) => s.name));
}

/** Print the script for one shell. Needs no library, so it works on a new machine too. */
function scriptCommand(shell: Shell, how: string): FreeCommandSpec {
  return {
    name: shell,
    summary: `Print the ${shell === "bash" ? "Bash" : "Zsh"} completion script`,
    usage: "",
    flags: [],
    notes: [how, "Skill, agent, preset and tag names are read from the library as you type."],
    runWithoutLibrary: async ({ args }: FreeCommandContext): Promise<CommandResult> => {
      limitPositionals(args, 0);
      // Read when run, not when loaded: the list of groups includes this one.
      const script = completionScript(shell, completionSpec(COMMAND_GROUPS, GLOBAL_FLAGS));
      return { value: { shell, script }, text: script.trimEnd() };
    },
  };
}

/**
 * Names the completion scripts offer, one per line. Quiet by design: without a library, or on
 * any failure, it prints nothing, so pressing Tab never shows an error.
 */
const wordsCommand: FreeCommandSpec = {
  name: "words",
  summary: "Names for shell completion, one per line",
  usage: `<${LIBRARY_WORD_KINDS.join("|")}>`,
  flags: [],
  hidden: true,
  runWithoutLibrary: async ({ args, openExisting }) => {
    limitPositionals(args, 1);
    const kind = positional(args, 0, "what to list");
    if (!isWordKind(kind)) {
      throw new UsageError(`Pick one of: ${LIBRARY_WORD_KINDS.join(", ")}.`);
    }
    let words: string[] = [];
    try {
      const core = openExisting();
      if (core) words = await wordsOf(core, kind);
    } catch {
      words = [];
    }
    return { value: words, text: words.join("\n") };
  },
};

export const completionGroup: CommandGroup = {
  name: "completion",
  summary: "Tab completion for Bash and Zsh",
  commands: [
    scriptCommand("bash", `Add to ~/.bashrc:  eval "$(${CLI_BINARY_NAME} completion bash)"`),
    scriptCommand(
      "zsh",
      `Add to ~/.zshrc, after compinit:  eval "$(${CLI_BINARY_NAME} completion zsh)"`,
    ),
    wordsCommand,
  ],
};
