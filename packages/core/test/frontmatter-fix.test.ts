import { checkSkillDocument, describeFromBody, fixFrontmatter, hasSkillErrors } from "@loadout/shared";
import { describe, expect, it } from "vitest";

/** The fix must leave nothing the format checks call an error. */
function expectValid(content: string, folder: string): void {
  expect(hasSkillErrors(checkSkillDocument(content, folder).issues)).toBe(false);
}

describe("fixFrontmatter", () => {
  it("adds frontmatter to a document without any", () => {
    const fix = fixFrontmatter("# PDF tools\n\nFill and merge PDF forms.\n", "pdf");
    expect(fix?.content).toBe(
      "---\nname: pdf\ndescription: Fill and merge PDF forms.\n---\n# PDF tools\n\nFill and merge PDF forms.\n",
    );
    expect(fix).toMatchObject({ addedName: "pdf", addedDescription: "Fill and merge PDF forms." });
    expectValid(fix?.content ?? "", "pdf");
  });

  it("adds only the missing field and keeps the other lines as they were", () => {
    const content = "---\n# kept comment\nname: pdf\nlicense: MIT\n---\n\nMerge PDF files quickly.\n";
    const fix = fixFrontmatter(content, "pdf");
    expect(fix?.addedName).toBeNull();
    expect(fix?.content).toBe(
      "---\n# kept comment\nname: pdf\nlicense: MIT\ndescription: Merge PDF files quickly.\n---\n\nMerge PDF files quickly.\n",
    );
  });

  it("puts a missing name first and fills an empty key in place", () => {
    const fix = fixFrontmatter("---\ndescription:\nlicense: MIT\n---\nUse it for reports.\n", "rep");
    expect(fix?.content).toBe(
      "---\nname: rep\ndescription: Use it for reports.\nlicense: MIT\n---\nUse it for reports.\n",
    );
  });

  it("fills an empty frontmatter block", () => {
    const fix = fixFrontmatter("---\n---\nWrites release notes from commits.\n", "notes");
    expect(fix?.content).toBe(
      "---\nname: notes\ndescription: Writes release notes from commits.\n---\nWrites release notes from commits.\n",
    );
    expectValid(fix?.content ?? "", "notes");
  });

  it("keeps Windows line endings and a byte-order mark", () => {
    const fix = fixFrontmatter("﻿---\r\nname: win\r\n---\r\nWorks on Windows files.\r\n", "win");
    expect(fix?.content).toBe(
      "﻿---\r\nname: win\r\ndescription: Works on Windows files.\r\n---\r\nWorks on Windows files.\r\n",
    );
  });

  it("quotes values YAML would misread", () => {
    const fix = fixFrontmatter("Usage: run it with care, always.\n", "true");
    expect(fix?.content.split("\n").slice(1, 3)).toEqual([
      'name: "true"',
      'description: "Usage: run it with care, always."',
    ]);
    expectValid(fix?.content ?? "", "true");
  });

  it("replaces a name that is not text", () => {
    const fix = fixFrontmatter("---\nname:\n  - a\ndescription: Something long enough.\n---\n", "x");
    expect(fix?.content).toBe("---\nname: x\ndescription: Something long enough.\n---\n");
  });

  it("does nothing when both fields are there, or the YAML is broken", () => {
    expect(fixFrontmatter("---\nname: a\ndescription: Does things well.\n---\n", "a")).toBeNull();
    expect(fixFrontmatter("---\nname: [unclosed\n---\nBody text here.\n", "a")).toBeNull();
    expect(fixFrontmatter("---\n- a list\n---\nBody text here.\n", "a")).toBeNull();
  });
});

describe("describeFromBody", () => {
  it("takes the first paragraph of prose, without markup", () => {
    const body = "# Title\n\n```sh\nnot this\n```\n\n- nor a list\n\nUse **this** [line](x.md)\nand this one.\n\nNot this.";
    expect(describeFromBody(body)).toBe("Use this line and this one.");
  });

  it("falls back to the first heading, then a placeholder", () => {
    expect(describeFromBody("## Only a heading\n\n- list\n")).toBe("Only a heading");
    expect(describeFromBody("")).toBe("Instructions for the agent.");
  });

  it("stays within the description limit", () => {
    expect(describeFromBody("word ".repeat(400)).length).toBeLessThanOrEqual(1024);
  });
});
