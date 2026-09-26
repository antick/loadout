import { existsSync } from "node:fs";
import { diffTrees } from "@loadout/core";
import type { FileDiffEntry, Skill } from "@loadout/shared";
import { createTwoFilesPatch } from "diff";
import { flagBoolean, flagList } from "../args";
import { plural } from "../output";
import { AGENT_FLAG, limitPositionals, positional, requireAgent } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const UPSTREAM_FLAG = {
  name: "upstream",
  type: "boolean",
  description: "Compare with the skill's source instead (may download it).",
} as const;

type CopyState = "differs" | "same" | "linked" | "missing";

interface Comparison {
  /** An agent key, or "upstream". */
  against: string;
  path: string | null;
  state: CopyState;
  entries: FileDiffEntry[];
}

const LIBRARY_LABEL = "library";

/** One file's change as text: a unified patch for text, a line saying what changed otherwise. */
function describeEntry(entry: FileDiffEntry, otherLabel: string): string {
  if (entry.kind === "text" && entry.status === "modified") {
    return createTwoFilesPatch(
      `${LIBRARY_LABEL}/${entry.path}`,
      `${otherLabel}/${entry.path}`,
      entry.before ?? "",
      entry.after ?? "",
    ).trimEnd();
  }
  const what = {
    text: "",
    binary: " (binary)",
    too_large: " (too large to show)",
    permission_only: " (only the executable bit)",
  }[entry.kind];
  const status = { added: "only in", removed: "missing from", modified: "changed in" }[
    entry.status
  ];
  return `${status} ${otherLabel}: ${entry.path}${what}`;
}

function describe(comparison: Comparison): string[] {
  const where = comparison.path ? ` (${comparison.path})` : "";
  const head = `${LIBRARY_LABEL} vs ${comparison.against}${where}`;
  switch (comparison.state) {
    case "linked":
      return [`${head}: a link to the library, always the same.`];
    case "missing":
      return [`${head}: not on disk.`];
    case "same":
      return [`${head}: the same.`];
    case "differs":
      return [
        `${head}: ${plural(comparison.entries.length, "file")} differ.`,
        ...comparison.entries.map((entry) => describeEntry(entry, comparison.against)),
      ];
  }
}

/** The library copy against each agent's copy on disk. */
function compareDeployments(skill: Skill, agentKeys: readonly string[]): Comparison[] {
  const wanted = new Set(agentKeys);
  return skill.deployments
    .filter((deployment) => wanted.size === 0 || wanted.has(deployment.agentKey))
    .map((deployment): Comparison => {
      const base = { against: deployment.agentKey, path: deployment.targetPath, entries: [] };
      if (deployment.mode === "symlink") return { ...base, state: "linked" };
      if (!existsSync(deployment.targetPath)) return { ...base, state: "missing" };
      const entries = diffTrees(skill.libraryPath, deployment.targetPath);
      return { ...base, state: entries.length > 0 ? "differs" : "same", entries };
    });
}

/** Show how a skill's copies (or its source) differ from the library, file by file. */
async function diff({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const skill = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
  const agentKeys = [...new Set(flagList(args, AGENT_FLAG.name))];
  for (const key of agentKeys) requireAgent(core, key, false);

  let comparisons: Comparison[];
  if (flagBoolean(args, UPSTREAM_FLAG.name)) {
    const source = await core.api.updates.sourceDiff(skill.id);
    comparisons = [
      {
        against: "upstream",
        path: source.sourceLabel,
        state: source.entries.length > 0 ? "differs" : "same",
        entries: source.entries,
      },
    ];
  } else {
    comparisons = compareDeployments(skill, agentKeys);
  }

  const lines =
    comparisons.length > 0
      ? comparisons.flatMap(describe)
      : [`${skill.name} is not deployed${agentKeys.length > 0 ? " to those agents" : ""}.`];
  return {
    value: { id: skill.id, name: skill.name, comparisons },
    text: lines.join("\n"),
  };
}

export const diffCommand: CommandSpec = {
  name: "diff",
  summary: "Show how a skill's copies, or its source, differ from the library",
  usage: "<ref> [--agent <key>…] [--upstream]",
  flags: [AGENT_FLAG, UPSTREAM_FLAG],
  notes: [
    "Linked deployments are the library itself and always match. Copies are compared file by file; text files show a unified diff with the library first.",
  ],
  run: diff,
};
