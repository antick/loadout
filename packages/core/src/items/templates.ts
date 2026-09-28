import type { ItemKind } from "@loadout/shared";

/** What a new item starts as: the fields its kind uses, with text to replace. */
export function itemTemplate(kind: ItemKind, name: string): string {
  switch (kind) {
    case "subagent":
      return [
        "---",
        `name: ${name}`,
        "description: Say what this subagent does and when to hand work to it.",
        "tools: Read, Grep, Glob",
        "---",
        "",
        "You are a focused assistant. Describe how to work, step by step.",
        "",
      ].join("\n");
    case "command":
      return [
        "---",
        "description: Say what this command does.",
        'argument-hint: "[what to work on]"',
        "---",
        "",
        "Do the task for $ARGUMENTS.",
        "",
      ].join("\n");
    case "rule":
      return [
        "---",
        "description: Say what these rules are about.",
        "paths:",
        '  - "src/**/*"',
        "---",
        "",
        "- Write one rule per line.",
        "",
      ].join("\n");
  }
}
