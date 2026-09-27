import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EditorService } from "../src/editor";
import { MAX_LINE_EDITS, decodeText, encodeText } from "../src/editor/text-file";
import { createEditorWorld, libraryLocation as lib } from "./editor-world";
import type { UpdatesWorld } from "./updates-world";

/** Save `edit(content)` over `original` the way the editor does: decode, edit, encode. */
function resave(original: string, edit: (content: string) => string): string {
  const decoded = decodeText(Buffer.from(original, "utf8"));
  if (!decoded) throw new Error("not text");
  return encodeText(edit(decoded.content), decoded.eol, decoded.bom, decoded.raw).toString("utf8");
}

describe("mixed line endings", () => {
  const mixed = "one\r\ntwo\nthree\r\nfour\r\n";

  it("keeps the ending of every untouched line", () => {
    expect(resave(mixed, (text) => text.replace("two", "TWO"))).toBe(
      "one\r\nTWO\r\nthree\r\nfour\r\n",
    );
    expect(resave(mixed, (text) => text.replace("three", "THREE"))).toBe(
      "one\r\ntwo\nTHREE\r\nfour\r\n",
    );
    expect(resave(mixed, (text) => text)).toBe(mixed);
  });

  it("gives new lines the file's usual ending and drops removed ones", () => {
    expect(resave(mixed, (text) => text.replace("two\n", "two\nadded\n"))).toBe(
      "one\r\ntwo\nadded\r\nthree\r\nfour\r\n",
    );
    expect(resave(mixed, (text) => text.replace("one\n", ""))).toBe("two\nthree\r\nfour\r\n");
    expect(resave("a\nb\r\nc\n", (text) => `${text}d\n`)).toBe("a\nb\r\nc\nd\n");
  });

  it("follows the end of the file", () => {
    expect(resave("a\r\nb\nc", (text) => `${text}\nd`)).toBe("a\r\nb\nc\nd");
    expect(resave("a\r\nb\nc\n", (text) => text.slice(0, -1))).toBe("a\r\nb\nc");
    expect(resave("a\r\nb\rc\n", (text) => text)).toBe("a\r\nb\rc\n");
  });

  it("uses the usual ending everywhere when the edit rewrites more than it can match", () => {
    const lines = Array.from({ length: MAX_LINE_EDITS + 2 }, (_, index) => `line ${index}`);
    const original = `${lines.join("\r\n")}\r\nlast\n`;
    const rows = lines.map((line) => line.replace("line", "row"));
    expect(resave(original, (text) => text.replaceAll("line", "row"))).toBe(
      `${rows.join("\r\n")}\r\nlast\r\n`,
    );
  });

  it("leaves files with one kind of ending as before", () => {
    expect(resave("a\r\nb\r\n", (text) => `${text}c\n`)).toBe("a\r\nb\r\nc\r\n");
    expect(resave("a\nb\n", (text) => `${text}c\n`)).toBe("a\nb\nc\n");
  });
});

describe("saving a mixed file", () => {
  let world: UpdatesWorld;
  let editor: EditorService;
  beforeEach(() => {
    ({ world, editor } = createEditorWorld());
  });
  afterEach(() => world.restore());

  it("changes only the edited line on disk", async () => {
    const skill = world.addSkill("alpha");
    const path = join(skill.libraryPath, "notes.md");
    writeFileSync(path, "# Notes\r\nfirst\nsecond\r\n");
    const file = await editor.api.readFile(lib(skill.id), "notes.md");
    expect(file.eol).toBe("crlf");
    await editor.api.saveFile(lib(skill.id), {
      path: "notes.md",
      content: file.content.replace("second", "2nd"),
      baseHash: file.hash,
    });
    expect(readFileSync(path, "utf8")).toBe("# Notes\r\nfirst\n2nd\r\n");
  });
});
