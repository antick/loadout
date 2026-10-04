import {
  ITEM_TARGETS,
  exportItem,
  formatToml,
  importItem,
  parseMarkdown,
  parseTomlStrings,
} from "@loadout/shared";
import { describe, expect, it } from "vitest";

const REVIEWER = `---
name: something-else
description: Reviews code for bugs.
tools: Read, Grep, Glob, mcp__github__search
model: sonnet
color: blue
---

You review code.
`;

const COMMIT = `---
description: Write a commit message
argument-hint: "[scope]"
allowed-tools: Bash(git diff:*)
---

Commit for $ARGUMENTS. Status: !\`git status\`
`;

const STYLE = `---
description: Style rules
paths:
  - "src/**/*.ts"
  - "test/**/*.ts"
---

Use two spaces.
`;

const codes = (warnings: { code: string }[]): string[] => warnings.map((warning) => warning.code);

describe("exportItem: subagents", () => {
  it("keeps Claude Code's own format and sets the name to the item's", () => {
    const out = exportItem("subagent", "reviewer", REVIEWER, "claude");
    expect(parseMarkdown(out.content).fields).toMatchObject({
      name: "reviewer",
      tools: "Read, Grep, Glob, mcp__github__search",
      color: "blue",
    });
    expect(out.content.startsWith("---\nname: reviewer\n")).toBe(true);
    expect(out.warnings).toEqual([]);
  });

  it("turns the tool list into OpenCode permissions", () => {
    const out = exportItem("subagent", "reviewer", REVIEWER, "opencode_agent");
    const { fields, body } = parseMarkdown(out.content);
    expect(fields).toEqual({
      description: "Reviews code for bugs.",
      mode: "subagent",
      permission: {
        read: "allow",
        edit: "deny",
        glob: "allow",
        grep: "allow",
        bash: "deny",
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
    });
    expect(body.trim()).toBe("You review code.");
    expect(codes(out.warnings)).toEqual(["tools_partly_mapped", "fields_dropped", "model_dropped"]);
    expect(out.warnings[1]?.params.fields).toBe("color");
  });

  it("marks a Cursor subagent read-only when its tools only read", () => {
    const fields = parseMarkdown(
      exportItem("subagent", "reviewer", REVIEWER, "cursor_agent").content,
    ).fields;
    expect(fields).toEqual({
      name: "reviewer",
      description: "Reviews code for bugs.",
      readonly: true,
    });
    const writer = REVIEWER.replace("tools: Read", "tools: Edit, Read");
    expect(
      parseMarkdown(exportItem("subagent", "w", writer, "cursor_agent").content).fields.readonly,
    ).toBeUndefined();
  });

  it("writes a Codex agent as TOML with the body as instructions", () => {
    const out = exportItem("subagent", "reviewer", REVIEWER, "codex_agent");
    expect(parseTomlStrings(out.content)).toEqual({
      name: "reviewer",
      description: "Reviews code for bugs.",
      developer_instructions: "You review code.",
    });
    expect(codes(out.warnings)).toContain("tools_dropped");
  });

  it("maps tools to GitHub Copilot's aliases", () => {
    const out = exportItem("subagent", "reviewer", REVIEWER, "copilot_agent");
    expect(parseMarkdown(out.content).fields.tools).toEqual(["read", "search"]);
  });

  it("keeps only an inherited model for Qwen Code and Factory Droid", () => {
    const inherit = REVIEWER.replace("model: sonnet", "model: inherit");
    for (const format of ["qwen_agent", "droid_agent"] as const) {
      expect(parseMarkdown(exportItem("subagent", "r", inherit, format).content).fields.model).toBe(
        "inherit",
      );
    }
  });
});

describe("exportItem: commands", () => {
  it("writes Gemini CLI TOML with its own argument and shell syntax", () => {
    const out = exportItem("command", "commit", COMMIT, "gemini_command");
    expect(parseTomlStrings(out.content)).toEqual({
      description: "Write a commit message",
      prompt: "Commit for {{args}}. Status: !{git status}",
    });
    expect(out.warnings[0]?.params.fields).toBe("argument-hint, allowed-tools");
  });

  it("keeps Claude Code commands without adding a name", () => {
    const out = exportItem("command", "commit", COMMIT, "claude");
    expect(parseMarkdown(out.content).fields.name).toBeUndefined();
  });

  it("gives Copilot prompts an input variable", () => {
    const out = exportItem("command", "commit", COMMIT, "copilot_prompt");
    expect(parseMarkdown(out.content).body).toContain("Commit for ${input:arguments}.");
  });

  it("warns about numbered arguments", () => {
    const out = exportItem("command", "c", "Use $1 and $2.\n", "opencode_command");
    expect(codes(out.warnings)).toEqual(["positional_arguments"]);
  });
});

describe("exportItem: rules", () => {
  it("writes Cursor .mdc fields", () => {
    const fields = parseMarkdown(exportItem("rule", "style", STYLE, "cursor_rule").content).fields;
    expect(fields).toEqual({
      description: "Style rules",
      globs: "src/**/*.ts,test/**/*.ts",
      alwaysApply: false,
    });
    const always = parseMarkdown(
      exportItem("rule", "s", "Always.\n", "cursor_rule").content,
    ).fields;
    expect(always).toEqual({ alwaysApply: true });
  });

  it("writes Copilot applyTo, all files when there are no paths", () => {
    const fields = parseMarkdown(
      exportItem("rule", "s", "Always.\n", "copilot_instructions").content,
    ).fields;
    expect(fields).toEqual({ applyTo: "**" });
  });

  it("writes Kiro steering inclusion", () => {
    const out = exportItem("rule", "style", STYLE, "kiro_steering");
    expect(parseMarkdown(out.content).fields).toMatchObject({ inclusion: "fileMatch" });
    expect(codes(out.warnings)).toContain("several_patterns");
  });
});

describe("importItem", () => {
  it("reads an OpenCode agent's permissions back as tools", () => {
    const opencode = exportItem("subagent", "reviewer", REVIEWER, "opencode_agent").content;
    const fields = parseMarkdown(importItem("opencode_agent", opencode).content).fields;
    expect(fields).toEqual({ description: "Reviews code for bugs.", tools: "Read, Glob, Grep" });
  });

  it("reads Gemini CLI TOML commands", () => {
    const toml = formatToml([
      ["description", "Commit"],
      ["prompt", "Commit {{args}}\nStatus: !{git status}"],
    ]);
    const { fields, body } = parseMarkdown(importItem("gemini_command", toml).content);
    expect(fields).toEqual({ description: "Commit" });
    expect(body.trim()).toBe("Commit $ARGUMENTS\nStatus: !`git status`");
  });

  it("reads Cursor and Copilot rules", () => {
    const mdc =
      "---\ndescription: TS\nglobs: src/**/*.ts, lib/*.ts\nalwaysApply: false\n---\nBody\n";
    expect(parseMarkdown(importItem("cursor_rule", mdc).content).fields).toEqual({
      description: "TS",
      paths: ["src/**/*.ts", "lib/*.ts"],
    });
    const copilot = '---\napplyTo: "**"\n---\nBody\n';
    expect(parseMarkdown(importItem("copilot_instructions", copilot).content).fields).toEqual({});
  });

  it("round-trips every format without losing the body", () => {
    const sources = { subagent: REVIEWER, command: COMMIT, rule: STYLE };
    for (const target of ITEM_TARGETS) {
      const exported = exportItem(target.kind, "item", sources[target.kind], target.format).content;
      const back = parseMarkdown(importItem(target.format, exported).content);
      expect(back.body.trim().length, `${target.agentKey} ${target.kind}`).toBeGreaterThan(0);
      expect(back.fields.description ?? "none", `${target.agentKey} ${target.kind}`).toBeTruthy();
    }
  });
});

describe("TOML strings", () => {
  it("round-trips quotes, backslashes and triple quotes", () => {
    const tricky = 'Say "hi" \\ path C:\\x\nand """three""" quotes';
    expect(parseTomlStrings(formatToml([["prompt", tricky]])).prompt).toBe(tricky);
    expect(parseTomlStrings(formatToml([["d", 'one "line"']])).d).toBe('one "line"');
  });

  it("reads literal strings and stops at the first table", () => {
    const text = "a = 'lit \\n'\nb = '''\nmulti\n'''\n[table]\nc = \"no\"\n";
    expect(parseTomlStrings(text)).toEqual({ a: "lit \\n", b: "multi\n" });
  });
});
