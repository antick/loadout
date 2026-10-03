import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("splits the leading block off, also after blank lines", () => {
    const parsed = parseFrontmatter("\n\n---\nname: pdf\ndescription: Read PDFs\n---\n# PDF\n");
    expect(parsed.entries).toEqual([
      { key: "name", value: "pdf" },
      { key: "description", value: "Read PDFs" },
    ]);
    expect(parsed.body).toBe("# PDF\n");
  });

  it("leaves a document without one as it is", () => {
    expect(parseFrontmatter("# Just text\n")).toEqual({ entries: [], body: "# Just text\n" });
  });
});
