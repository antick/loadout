import { describe, expect, it } from "vitest";
import { frontmatterProblems } from "./frontmatter-checks";

describe("frontmatter checks", () => {
  it("accepts a document with a name and a description", () => {
    expect(frontmatterProblems("---\nname: pdf\ndescription: Read PDFs\n---\nBody")).toEqual([]);
  });

  it("accepts a multi-line description", () => {
    expect(frontmatterProblems("---\nname: pdf\ndescription: |\n  Read PDFs\n---\n")).toEqual([]);
  });

  it("reports what is missing", () => {
    expect(frontmatterProblems("# Just a heading")).toEqual(["missing"]);
    expect(frontmatterProblems("---\nname: pdf\n---\n")).toEqual(["description"]);
    expect(frontmatterProblems("---\nname:\ndescription: x\n---\n")).toEqual(["name"]);
  });
});
