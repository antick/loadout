import { formatMarkdown, formatToml, listField, parseMarkdown, textField } from "./item-format";
import type { ItemFormat } from "./item-targets";
import type { ItemKind } from "./items";
import {
  CLAUDE_TO_COPILOT,
  CLAUDE_TO_OPENCODE,
  CLAUDE_WRITE_TOOLS,
  type ItemWarning,
  OPENCODE_PERMISSION_KEYS,
  itemWarning,
} from "./item-tools";

/**
 * From the library's format (Claude Code's) to the file one agent reads. Anything the agent has no
 * place for is left out and said in a warning, never guessed.
 */

export interface ConvertedItem {
  content: string;
  warnings: ItemWarning[];
}

interface Parsed {
  kind: ItemKind;
  name: string;
  fields: Record<string, unknown>;
  body: string;
  warnings: ItemWarning[];
}

/** Fields left out with no specific warning of their own, named in one `fields_dropped` note. */
function dropRest(parsed: Parsed, handled: readonly string[]): void {
  const dropped = Object.keys(parsed.fields).filter((key) => !handled.includes(key));
  if (dropped.length > 0) {
    parsed.warnings.push(itemWarning("fields_dropped", { fields: dropped.join(", ") }));
  }
}

/** Keep the model only when this agent reads it as written. */
function model(parsed: Parsed, keep: (value: string) => boolean): string | undefined {
  const value = textField(parsed.fields, "model");
  if (value === null) return undefined;
  if (keep(value)) return value;
  parsed.warnings.push(itemWarning("model_dropped", { model: value }));
  return undefined;
}

const isInherit = (value: string): boolean => value === "inherit";
const isProviderModel = (value: string): boolean => value.includes("/");

function tools(parsed: Parsed): string[] {
  return listField(parsed.fields, "tools");
}

function dropTools(parsed: Parsed): void {
  const list = tools(parsed);
  if (list.length > 0)
    parsed.warnings.push(itemWarning("tools_dropped", { tools: list.join(", ") }));
}

/**
 * The library's own format, as it is. A subagent's `name` is its id in Claude Code, so it is set
 * to the item's name; commands and rules have no such field.
 */
function claude(parsed: Parsed): string {
  if (parsed.kind !== "subagent") return formatMarkdown(parsed.fields, parsed.body);
  return formatMarkdown(orderNameFirst({ ...parsed.fields, name: parsed.name }), parsed.body);
}

function orderNameFirst(fields: Record<string, unknown>): Record<string, unknown> {
  if (!("name" in fields)) return fields;
  const { name, ...rest } = fields;
  return { name, ...rest };
}

function opencodeAgent(parsed: Parsed): string {
  const list = tools(parsed);
  let permission: Record<string, string> | undefined;
  if (list.length > 0) {
    const allowed = new Set(list.flatMap((tool) => CLAUDE_TO_OPENCODE[tool] ?? []));
    const unmapped = list.filter((tool) => !CLAUDE_TO_OPENCODE[tool]);
    if (unmapped.length > 0) {
      parsed.warnings.push(itemWarning("tools_partly_mapped", { tools: unmapped.join(", ") }));
    }
    permission = Object.fromEntries(
      OPENCODE_PERMISSION_KEYS.map((key) => [key, allowed.has(key) ? "allow" : "deny"]),
    );
  }
  dropRest(parsed, ["name", "description", "tools", "model"]);
  return formatMarkdown(
    {
      description: textField(parsed.fields, "description") ?? undefined,
      mode: "subagent",
      model: model(parsed, isProviderModel),
      permission,
    },
    parsed.body,
  );
}

function cursorAgent(parsed: Parsed): string {
  const list = tools(parsed);
  const readonly = list.length > 0 && !list.some((tool) => CLAUDE_WRITE_TOOLS.has(tool));
  dropRest(parsed, ["name", "description", "tools", "model"]);
  return formatMarkdown(
    {
      name: parsed.name,
      description: textField(parsed.fields, "description") ?? undefined,
      model: model(parsed, isInherit),
      readonly: readonly || undefined,
    },
    parsed.body,
  );
}

function codexAgent(parsed: Parsed): string {
  dropTools(parsed);
  model(parsed, () => false);
  dropRest(parsed, ["name", "description", "tools", "model"]);
  return formatToml([
    ["name", parsed.name],
    ["description", textField(parsed.fields, "description") ?? ""],
    ["developer_instructions", parsed.body.trim()],
  ]);
}

function copilotAgent(parsed: Parsed): string {
  const list = tools(parsed);
  const mapped = [...new Set(list.flatMap((tool) => CLAUDE_TO_COPILOT[tool] ?? []))];
  const unmapped = list.filter((tool) => !CLAUDE_TO_COPILOT[tool]);
  if (unmapped.length > 0) {
    parsed.warnings.push(itemWarning("tools_partly_mapped", { tools: unmapped.join(", ") }));
  }
  dropRest(parsed, ["name", "description", "tools", "model"]);
  return formatMarkdown(
    {
      name: parsed.name,
      description: textField(parsed.fields, "description") ?? undefined,
      tools: mapped.length > 0 ? mapped : undefined,
      model: model(parsed, () => false),
    },
    parsed.body,
  );
}

/** Gemini CLI, Qwen Code and Factory Droid subagents: name, description, and `inherit` models. */
function plainAgent(parsed: Parsed, keepModel: (value: string) => boolean): string {
  dropTools(parsed);
  dropRest(parsed, ["name", "description", "tools", "model"]);
  return formatMarkdown(
    {
      name: parsed.name,
      description: textField(parsed.fields, "description") ?? undefined,
      model: model(parsed, keepModel),
    },
    parsed.body,
  );
}

const POSITIONAL = /\$(?:\d|ARGUMENTS\[\d+\])/;

function warnPositional(parsed: Parsed): void {
  if (POSITIONAL.test(parsed.body)) parsed.warnings.push(itemWarning("positional_arguments"));
}

/** `$ARGUMENTS` → `{{args}}` and `` !`cmd` `` → `!{cmd}`, for Gemini CLI and Qwen Code. */
function curlyArguments(body: string): string {
  return body.replace(/\$ARGUMENTS(?!\[)/g, "{{args}}").replace(/!`([^`\n]+)`/g, "!{$1}");
}

function commandFields(parsed: Parsed, keep: readonly string[]): Record<string, unknown> {
  dropRest(parsed, keep);
  return Object.fromEntries(keep.map((key) => [key, textField(parsed.fields, key) ?? undefined]));
}

function opencodeCommand(parsed: Parsed): string {
  warnPositional(parsed);
  dropRest(parsed, ["description", "model"]);
  return formatMarkdown(
    {
      description: textField(parsed.fields, "description") ?? undefined,
      model: model(parsed, isProviderModel),
    },
    parsed.body,
  );
}

function geminiCommand(parsed: Parsed): string {
  warnPositional(parsed);
  dropRest(parsed, ["description"]);
  const description = textField(parsed.fields, "description");
  return formatToml([
    ...(description ? [["description", description] as const] : []),
    ["prompt", curlyArguments(parsed.body.trim())],
  ]);
}

function qwenCommand(parsed: Parsed): string {
  warnPositional(parsed);
  return formatMarkdown(commandFields(parsed, ["description"]), curlyArguments(parsed.body));
}

function copilotPrompt(parsed: Parsed): string {
  warnPositional(parsed);
  const fields = commandFields(parsed, ["description", "argument-hint"]);
  return formatMarkdown(
    { name: parsed.name, ...fields },
    parsed.body.replace(/\$ARGUMENTS(?!\[)/g, "${input:arguments}"),
  );
}

function droidCommand(parsed: Parsed): string {
  warnPositional(parsed);
  return formatMarkdown(commandFields(parsed, ["description", "argument-hint"]), parsed.body);
}

function paths(parsed: Parsed): string[] {
  return listField(parsed.fields, "paths");
}

function cursorRule(parsed: Parsed): string {
  const list = paths(parsed);
  dropRest(parsed, ["description", "paths"]);
  return formatMarkdown(
    {
      description: textField(parsed.fields, "description") ?? undefined,
      globs: list.length > 0 ? list.join(",") : undefined,
      alwaysApply: list.length === 0,
    },
    parsed.body,
  );
}

function copilotInstructions(parsed: Parsed): string {
  const list = paths(parsed);
  dropRest(parsed, ["description", "paths"]);
  return formatMarkdown(
    {
      description: textField(parsed.fields, "description") ?? undefined,
      applyTo: list.length > 0 ? list.join(",") : "**",
    },
    parsed.body,
  );
}

function kiroSteering(parsed: Parsed): string {
  const list = paths(parsed);
  dropRest(parsed, ["paths"]);
  if (list.length > 1) {
    parsed.warnings.push(itemWarning("several_patterns", { patterns: list.join(", ") }));
  }
  const fields =
    list.length === 0
      ? { inclusion: "always" }
      : { inclusion: "fileMatch", fileMatchPattern: list.length === 1 ? list[0] : list };
  return formatMarkdown(fields, parsed.body);
}

/** Cline and Qwen Code rules read `paths` like Claude Code. */
function pathsRule(parsed: Parsed, keep: readonly string[]): string {
  const list = paths(parsed);
  dropRest(parsed, keep);
  const fields: Record<string, unknown> = {};
  if (keep.includes("description")) {
    fields.description = textField(parsed.fields, "description") ?? undefined;
  }
  if (list.length > 0) fields.paths = list;
  return formatMarkdown(fields, parsed.body);
}

const WRITERS: Record<ItemFormat, (parsed: Parsed) => string> = {
  claude,
  opencode_agent: opencodeAgent,
  cursor_agent: cursorAgent,
  codex_agent: codexAgent,
  gemini_agent: (parsed) => plainAgent(parsed, () => false),
  copilot_agent: copilotAgent,
  qwen_agent: (parsed) => plainAgent(parsed, isInherit),
  droid_agent: (parsed) => plainAgent(parsed, isInherit),
  opencode_command: opencodeCommand,
  gemini_command: geminiCommand,
  qwen_command: qwenCommand,
  copilot_prompt: copilotPrompt,
  droid_command: droidCommand,
  cursor_rule: cursorRule,
  copilot_instructions: copilotInstructions,
  kiro_steering: kiroSteering,
  cline_rule: (parsed) => pathsRule(parsed, ["paths"]),
  qwen_rule: (parsed) => pathsRule(parsed, ["description", "paths"]),
};

/** The file an agent gets for a library item named `name`, and what could not be carried over. */
export function exportItem(
  kind: ItemKind,
  name: string,
  content: string,
  format: ItemFormat,
): ConvertedItem {
  const { fields, body } = parseMarkdown(content);
  const parsed: Parsed = { kind, name, fields, body, warnings: [] };
  const output = WRITERS[format](parsed);
  return { content: output, warnings: parsed.warnings };
}
