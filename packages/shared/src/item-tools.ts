/**
 * Tool names across agents, for converting a subagent's list of allowed tools, and the notes a
 * conversion leaves when something could not be carried over exactly.
 */

export const ITEM_WARNING_CODES = [
  "fields_dropped",
  "tools_dropped",
  "tools_partly_mapped",
  "model_dropped",
  "positional_arguments",
  "several_patterns",
] as const;
export type ItemWarningCode = (typeof ITEM_WARNING_CODES)[number];

export interface ItemWarning {
  code: ItemWarningCode;
  /** English sentence for the CLI and logs; the app words it from `code` and `params`. */
  message: string;
  params: Record<string, string>;
}

const MESSAGES: Record<ItemWarningCode, (params: Record<string, string>) => string> = {
  fields_dropped: (p) => `Left out, as this agent has no such setting: ${p.fields}.`,
  tools_dropped: (p) =>
    `The tool list (${p.tools}) is left out: this agent names its tools differently, so it may use every tool.`,
  tools_partly_mapped: (p) =>
    `These tools have no match in this agent and are left out: ${p.tools}.`,
  model_dropped: (p) =>
    `The model "${p.model}" is left out: this agent names models differently and uses its default.`,
  positional_arguments: () =>
    "The text uses numbered arguments ($1, $ARGUMENTS[0]); check they mean the same in this agent.",
  several_patterns: (p) =>
    `Several file patterns (${p.patterns}); this agent may use only the first.`,
};

export function itemWarning(
  code: ItemWarningCode,
  params: Record<string, string> = {},
): ItemWarning {
  return { code, message: MESSAGES[code](params), params };
}

/** Claude Code tool → OpenCode permission key. The `edit` permission also covers writing. */
export const CLAUDE_TO_OPENCODE: Readonly<Record<string, string>> = {
  Read: "read",
  Write: "edit",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Bash: "bash",
  Grep: "grep",
  Glob: "glob",
  WebFetch: "webfetch",
  WebSearch: "websearch",
  Task: "task",
};

/** OpenCode permission keys a subagent's tool list decides, in the order they are written. */
export const OPENCODE_PERMISSION_KEYS = [
  "read",
  "edit",
  "glob",
  "grep",
  "bash",
  "task",
  "webfetch",
  "websearch",
] as const;

/** OpenCode permission key → the Claude Code tools it stands for. */
export const OPENCODE_TO_CLAUDE: Readonly<Record<string, readonly string[]>> = {
  read: ["Read"],
  edit: ["Edit", "Write"],
  write: ["Write"],
  glob: ["Glob"],
  grep: ["Grep"],
  bash: ["Bash"],
  task: ["Task"],
  webfetch: ["WebFetch"],
  websearch: ["WebSearch"],
  todowrite: ["TodoWrite"],
};

/** Claude Code tool → GitHub Copilot tool alias, from GitHub's custom agents reference. */
export const CLAUDE_TO_COPILOT: Readonly<Record<string, string>> = {
  Bash: "execute",
  Read: "read",
  NotebookRead: "read",
  Edit: "edit",
  Write: "edit",
  MultiEdit: "edit",
  Grep: "search",
  Glob: "search",
  Task: "agent",
  WebSearch: "web",
  WebFetch: "web",
  TodoWrite: "todo",
};

export const COPILOT_TO_CLAUDE: Readonly<Record<string, readonly string[]>> = {
  execute: ["Bash"],
  read: ["Read"],
  edit: ["Edit", "Write"],
  search: ["Grep", "Glob"],
  agent: ["Task"],
  web: ["WebFetch", "WebSearch"],
  todo: ["TodoWrite"],
};

/** Claude Code tools that change files or run commands: a subagent without them only reads. */
export const CLAUDE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
]);

/** A read-only subagent imported from an agent that only says "read-only". */
export const CLAUDE_READ_ONLY_TOOLS = ["Read", "Grep", "Glob"] as const;
