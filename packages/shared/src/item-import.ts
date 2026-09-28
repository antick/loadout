import {
  formatMarkdown,
  listField,
  parseMarkdown,
  parseTomlStrings,
  textField,
} from "./item-format";
import type { ItemFormat } from "./item-targets";
import {
  CLAUDE_READ_ONLY_TOOLS,
  COPILOT_TO_CLAUDE,
  type ItemWarning,
  OPENCODE_TO_CLAUDE,
  itemWarning,
} from "./item-tools";

/**
 * From a file one agent reads back to the library's format (Claude Code's), for importing items
 * found in agent folders, projects and repositories. The reverse of `exportItem`.
 */

export interface ImportedItem {
  content: string;
  warnings: ItemWarning[];
}

type Fields = Record<string, unknown>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** An OpenCode agent's `permission` map (or the older `tools` map) as Claude Code tools. */
function openCodeTools(fields: Fields): string[] {
  const allowed: string[] = [];
  const permission = fields.permission;
  if (permission && typeof permission === "object" && !Array.isArray(permission)) {
    for (const [key, value] of Object.entries(permission)) {
      if (value === "allow" || value === "ask") allowed.push(key);
    }
  }
  const tools = fields.tools;
  if (tools && typeof tools === "object" && !Array.isArray(tools)) {
    for (const [key, value] of Object.entries(tools)) if (value === true) allowed.push(key);
  }
  return unique(allowed.flatMap((key) => OPENCODE_TO_CLAUDE[key] ?? []));
}

function subagent(fields: Fields, body: string, tools: string[]): string {
  return formatMarkdown(
    {
      description: textField(fields, "description") ?? undefined,
      tools: tools.length > 0 ? tools.join(", ") : undefined,
      model: textField(fields, "model") ?? undefined,
    },
    body,
  );
}

function fromMarkdown(format: ItemFormat, text: string, warnings: ItemWarning[]): string {
  const { fields, body } = parseMarkdown(text);
  const listedTools = listField(fields, "tools");
  switch (format) {
    case "claude":
      return formatMarkdown(fields, body);
    case "opencode_agent":
      return subagent(fields, body, openCodeTools(fields));
    case "cursor_agent":
      return subagent(fields, body, fields.readonly === true ? [...CLAUDE_READ_ONLY_TOOLS] : []);
    case "copilot_agent":
      return subagent(
        fields,
        body,
        unique(listedTools.flatMap((tool) => COPILOT_TO_CLAUDE[tool] ?? [])),
      );
    case "gemini_agent":
    case "qwen_agent":
    case "droid_agent":
      if (listedTools.length > 0) {
        warnings.push(itemWarning("tools_dropped", { tools: listedTools.join(", ") }));
      }
      return subagent(fields, body, []);
    case "opencode_command":
    case "droid_command":
      return formatMarkdown(
        {
          description: textField(fields, "description") ?? undefined,
          "argument-hint": textField(fields, "argument-hint") ?? undefined,
        },
        body,
      );
    case "qwen_command":
      return formatMarkdown(
        { description: textField(fields, "description") ?? undefined },
        dollarArguments(body),
      );
    case "copilot_prompt":
      return formatMarkdown(
        {
          description: textField(fields, "description") ?? undefined,
          "argument-hint": textField(fields, "argument-hint") ?? undefined,
        },
        body.replace(/\$\{input:[^}]*\}/g, "$ARGUMENTS"),
      );
    case "cursor_rule": {
      const globs = fields.alwaysApply === true ? [] : listField(fields, "globs");
      return rule(textField(fields, "description"), globs, body);
    }
    case "copilot_instructions": {
      const applyTo = listField(fields, "applyTo").filter((glob) => glob !== "**");
      return rule(textField(fields, "description"), applyTo, body);
    }
    case "kiro_steering": {
      const patterns =
        fields.inclusion === "fileMatch" ? listField(fields, "fileMatchPattern") : [];
      return rule(textField(fields, "description"), patterns, body);
    }
    case "cline_rule":
    case "qwen_rule":
      return rule(textField(fields, "description"), listField(fields, "paths"), body);
    default:
      return formatMarkdown(fields, body);
  }
}

function rule(description: string | null, paths: string[], body: string): string {
  return formatMarkdown(
    { description: description ?? undefined, paths: paths.length > 0 ? paths : undefined },
    body,
  );
}

/** `{{args}}` → `$ARGUMENTS` and `!{cmd}` → `` !`cmd` ``: Gemini CLI and Qwen Code to Claude Code. */
function dollarArguments(body: string): string {
  return body.replace(/\{\{args\}\}/g, "$ARGUMENTS").replace(/!\{([^}\n]+)\}/g, "!`$1`");
}

/** Read an agent's file into the library's format. */
export function importItem(format: ItemFormat, text: string): ImportedItem {
  const warnings: ItemWarning[] = [];
  if (format === "gemini_command") {
    const toml = parseTomlStrings(text);
    const content = formatMarkdown(
      { description: toml.description ?? undefined },
      dollarArguments((toml.prompt ?? "").trim()),
    );
    return { content: `${content.trimEnd()}\n`, warnings };
  }
  if (format === "codex_agent") {
    const toml = parseTomlStrings(text);
    const content = subagent(
      { description: toml.description },
      (toml.developer_instructions ?? "").trim(),
      [],
    );
    return { content: `${content.trimEnd()}\n`, warnings };
  }
  return { content: fromMarkdown(format, text, warnings), warnings };
}
