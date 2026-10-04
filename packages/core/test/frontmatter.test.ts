import { checkSkillDocument, splitFrontmatter, textField } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/skills/metadata";

const NO_NAME = new Set(["name_missing", "frontmatter_missing", "frontmatter_invalid"]);

/** Every reader of frontmatter, so a rule is tested once against all of them. */
const readers = {
  split: (text: string) => textField(splitFrontmatter(text).data, "name"),
  skill: (text: string) => parseFrontmatter(text).name,
  check: (text: string) =>
    checkSkillDocument(text, "x").issues.some((issue) => NO_NAME.has(issue.code)) ? null : "named",
};

function names(text: string): Record<string, string | null> {
  return Object.fromEntries(Object.entries(readers).map(([key, read]) => [key, read(text)]));
}

describe("the shared frontmatter rules", () => {
  it("reads a number as the name it is written as, everywhere", () => {
    expect(names("---\nname: 2024\ndescription: d\n---\nBody\n")).toEqual({
      split: "2024",
      skill: "2024",
      check: "named",
    });
  });

  it("closes only at a line that is exactly the fence", () => {
    const text = "---\nname: a\nnote: |\n  ---x\n  ----\n---  \nBody\n";
    const split = splitFrontmatter(text);
    expect(split.data).toEqual({ name: "a", note: "---x\n----\n" });
    expect(split.body).toBe("Body\n");
    // A key that starts like the fence does not cut the block short.
    const key = splitFrontmatter("---\nname: a\n---x: 1\n---\nBody\n");
    expect(key).toMatchObject({ data: { name: "a", "---x": 1 }, body: "Body\n" });
    expect(splitFrontmatter("---\nname: a\n---x: 1\n").block).toBeNull();
  });

  it("treats a block that never closes as no frontmatter", () => {
    const text = "---\nname: a\nBody\n";
    expect(splitFrontmatter(text)).toEqual({ data: null, body: text, block: null });
    expect(names(text)).toEqual({ split: null, skill: null, check: null });
  });

  it("reads an empty block as no fields, with the body after it", () => {
    expect(splitFrontmatter("---\n---\nBody\n")).toMatchObject({ data: {}, body: "Body\n" });
    expect(splitFrontmatter("---\n# only a comment\n---\nBody\n").data).toEqual({});
  });

  it("allows a byte-order mark, blank lines and Windows line endings", () => {
    const split = splitFrontmatter("﻿\n\n---\r\nname: win\r\n---\r\nBody\r\n");
    expect(split.data).toEqual({ name: "win" });
    expect(split.body).toBe("Body\r\n");
  });

  it("reads broken frontmatter as no fields, never throwing", () => {
    for (const yaml of ["- a\n- list", "just text", "name: a\nname: b", "name: [oops"]) {
      const split = splitFrontmatter(`---\n${yaml}\n---\nBody\n`);
      expect(split.data).toBeNull();
      expect(split.body).toBe("Body\n");
    }
  });
});
