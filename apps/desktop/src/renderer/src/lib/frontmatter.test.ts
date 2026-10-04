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

  it("shows values the way YAML reads them", () => {
    const parsed = parseFrontmatter(
      "---\nname: 2024\ndescription: >\n  Folded\n  text\nallowed-tools:\n  - Read\n  - Grep\nhooks:\n  Stop: []\n---\n",
    );
    expect(parsed.entries).toEqual([
      { key: "name", value: "2024" },
      { key: "description", value: "Folded text\n" },
      { key: "allowed-tools", value: "Read, Grep" },
      { key: "hooks", value: '{"Stop":[]}' },
    ]);
  });

  it("shows frontmatter that does not parse as YAML above the body", () => {
    const parsed = parseFrontmatter("---\nname: [oops\n---\nBody\n");
    expect(parsed.entries).toEqual([]);
    expect(parsed.body).toBe("```yaml\nname: [oops\n```\n\nBody\n");
  });
});
