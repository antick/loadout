import { describe, expect, it } from "vitest";
import { languageForFence } from "@/features/editor/code-languages";
import { type CodeToken, highlightCode } from "@/features/editor/highlight-code";

const styleOf = (tokens: CodeToken[], text: string) =>
  tokens.find((token) => token.text === text)?.style;

describe("highlightCode", () => {
  it("colours code with the editor's rules and keeps every character", () => {
    const code = 'const name = "loadout";\nreturn 42;';
    const tokens = highlightCode(code, languageForFence("ts"));
    expect(tokens.map((token) => token.text).join("")).toBe(code);
    expect(styleOf(tokens, "const")).toEqual({ color: "var(--violet)" });
    expect(styleOf(tokens, '"loadout"')).toEqual({ color: "var(--success)" });
    expect(styleOf(tokens, "42")).toEqual({ color: "var(--warning)" });
  });

  it("knows fence names that are not file extensions", () => {
    expect(languageForFence("typescript").id).toBe("ts");
    expect(languageForFence("Bash").id).toBe("shell");
    expect(languageForFence("python title=run.py").id).toBe("python");
  });

  it("leaves unknown languages as one plain run", () => {
    expect(highlightCode("SELECT 1;", languageForFence("sql"))).toEqual([
      { text: "SELECT 1;", style: null },
    ]);
  });
});
