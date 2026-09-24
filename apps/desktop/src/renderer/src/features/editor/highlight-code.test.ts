import { describe, expect, it } from "vitest";
import { languageFor, languageForFence } from "@/features/editor/code-languages";
import { type CodeToken, highlightCode } from "@/features/editor/highlight-code";

const styleOf = (tokens: CodeToken[], text: string) =>
  tokens.find((token) => token.text === text)?.style;

describe("highlightCode", () => {
  it("colours code with the editor's rules and keeps every character", () => {
    const code = 'const name = "loadout";\nreturn 42;';
    const tokens = highlightCode(code, languageForFence("ts"));
    expect(tokens.map((token) => token.text).join("")).toBe(code);
    expect(styleOf(tokens, "const")).toEqual({ color: "var(--syntax-keyword)" });
    expect(styleOf(tokens, '"loadout"')).toEqual({ color: "var(--syntax-string)" });
    expect(styleOf(tokens, "42")).toEqual({ color: "var(--syntax-number)" });
  });

  it("knows fence names that are not file extensions", () => {
    expect(languageForFence("typescript").id).toBe("ts");
    expect(languageForFence("Bash").id).toBe("shell");
    expect(languageForFence("python title=run.py").id).toBe("python");
  });

  it("colours the line-by-line languages too", () => {
    const sql = highlightCode("SELECT 'a' FROM t;", languageForFence("postgres"));
    expect(styleOf(sql, "SELECT")).toEqual({ color: "var(--syntax-keyword)" });
    expect(styleOf(sql, "'a'")).toEqual({ color: "var(--syntax-string)" });

    const go = highlightCode("func main() { return 7 }", languageForFence("golang"));
    expect(styleOf(go, "func")).toEqual({ color: "var(--syntax-keyword)" });
    expect(styleOf(go, "7")).toEqual({ color: "var(--syntax-number)" });

    const patch = highlightCode("+added\n-removed", languageForFence("diff"));
    expect(styleOf(patch, "+added")).toEqual({ color: "var(--syntax-inserted)" });
    expect(styleOf(patch, "-removed")).toEqual({ color: "var(--syntax-deleted)" });
  });

  it("picks a file's language by its whole name, then its extension", () => {
    expect(languageFor("skill/Dockerfile").id).toBe("dockerfile");
    expect(languageFor("skill/.env").id).toBe("ini");
    expect(languageFor("skill/scripts/run.rs").id).toBe("rust");
    expect(languageFor("skill/LICENSE").id).toBe("text");
  });

  it("leaves unknown languages as one plain run", () => {
    expect(highlightCode("frob 1;", languageForFence("cobol"))).toEqual([
      { text: "frob 1;", style: null },
    ]);
  });
});
