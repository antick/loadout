import type { ItemKind } from "./items";

/**
 * Where each agent reads subagents, commands and rules, and in which format. Taken from each
 * agent's own documentation (checked September 2026); agents that document no folder for a kind,
 * or dropped it, are left out rather than guessed.
 *
 * `globalDir` is relative to the agent's own folder: the folder its skills folder sits in, such
 * as `~/.claude` (or `$CLAUDE_CONFIG_DIR`). `projectDir` is relative to a project's root.
 */

export type ItemFormat =
  | "claude"
  | "opencode_agent"
  | "cursor_agent"
  | "codex_agent"
  | "gemini_agent"
  | "copilot_agent"
  | "qwen_agent"
  | "droid_agent"
  | "opencode_command"
  | "gemini_command"
  | "qwen_command"
  | "copilot_prompt"
  | "droid_command"
  | "cursor_rule"
  | "copilot_instructions"
  | "kiro_steering"
  | "cline_rule"
  | "qwen_rule";

export interface ItemTarget {
  agentKey: string;
  kind: ItemKind;
  format: ItemFormat;
  /** Relative to the agent's folder; absent when the agent reads this kind only in projects. */
  globalDir?: string;
  /** Relative to a project's root; absent when the agent reads this kind only globally. */
  projectDir?: string;
  /** Appended to the item's name to make the file name. */
  extension: string;
}

export const ITEM_TARGETS: readonly ItemTarget[] = [
  // Subagents.
  {
    agentKey: "claude_code",
    kind: "subagent",
    format: "claude",
    globalDir: "agents",
    projectDir: ".claude/agents",
    extension: ".md",
  },
  {
    agentKey: "opencode",
    kind: "subagent",
    format: "opencode_agent",
    globalDir: "agents",
    projectDir: ".opencode/agents",
    extension: ".md",
  },
  {
    agentKey: "cursor",
    kind: "subagent",
    format: "cursor_agent",
    globalDir: "agents",
    projectDir: ".cursor/agents",
    extension: ".md",
  },
  {
    agentKey: "codex",
    kind: "subagent",
    format: "codex_agent",
    globalDir: "agents",
    projectDir: ".codex/agents",
    extension: ".toml",
  },
  {
    agentKey: "gemini_cli",
    kind: "subagent",
    format: "gemini_agent",
    globalDir: "agents",
    projectDir: ".gemini/agents",
    extension: ".md",
  },
  {
    agentKey: "github_copilot",
    kind: "subagent",
    format: "copilot_agent",
    globalDir: "agents",
    projectDir: ".github/agents",
    extension: ".agent.md",
  },
  {
    agentKey: "qwen_code",
    kind: "subagent",
    format: "qwen_agent",
    globalDir: "agents",
    projectDir: ".qwen/agents",
    extension: ".md",
  },
  {
    agentKey: "droid",
    kind: "subagent",
    format: "droid_agent",
    globalDir: "droids",
    projectDir: ".factory/droids",
    extension: ".md",
  },
  // Slash commands.
  {
    agentKey: "claude_code",
    kind: "command",
    format: "claude",
    globalDir: "commands",
    projectDir: ".claude/commands",
    extension: ".md",
  },
  {
    agentKey: "opencode",
    kind: "command",
    format: "opencode_command",
    globalDir: "commands",
    projectDir: ".opencode/commands",
    extension: ".md",
  },
  {
    agentKey: "gemini_cli",
    kind: "command",
    format: "gemini_command",
    globalDir: "commands",
    projectDir: ".gemini/commands",
    extension: ".toml",
  },
  {
    agentKey: "qwen_code",
    kind: "command",
    format: "qwen_command",
    globalDir: "commands",
    projectDir: ".qwen/commands",
    extension: ".md",
  },
  {
    agentKey: "github_copilot",
    kind: "command",
    format: "copilot_prompt",
    projectDir: ".github/prompts",
    extension: ".prompt.md",
  },
  {
    agentKey: "droid",
    kind: "command",
    format: "droid_command",
    globalDir: "commands",
    projectDir: ".factory/commands",
    extension: ".md",
  },
  // Rules.
  {
    agentKey: "claude_code",
    kind: "rule",
    format: "claude",
    globalDir: "rules",
    projectDir: ".claude/rules",
    extension: ".md",
  },
  {
    agentKey: "cursor",
    kind: "rule",
    format: "cursor_rule",
    projectDir: ".cursor/rules",
    extension: ".mdc",
  },
  {
    agentKey: "github_copilot",
    kind: "rule",
    format: "copilot_instructions",
    globalDir: "instructions",
    projectDir: ".github/instructions",
    extension: ".instructions.md",
  },
  {
    agentKey: "kiro",
    kind: "rule",
    format: "kiro_steering",
    globalDir: "steering",
    projectDir: ".kiro/steering",
    extension: ".md",
  },
  {
    agentKey: "cline",
    kind: "rule",
    format: "cline_rule",
    projectDir: ".clinerules",
    extension: ".md",
  },
  {
    agentKey: "qwen_code",
    kind: "rule",
    format: "qwen_rule",
    globalDir: "rules",
    projectDir: ".qwen/rules",
    extension: ".md",
  },
];

export function itemTargetsOf(kind: ItemKind): ItemTarget[] {
  return ITEM_TARGETS.filter((target) => target.kind === kind);
}

export function itemTargetFor(kind: ItemKind, agentKey: string): ItemTarget | null {
  return (
    ITEM_TARGETS.find((target) => target.kind === kind && target.agentKey === agentKey) ?? null
  );
}
