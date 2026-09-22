import { join } from "node:path";
import { type SkillIssue, checkSkillDocument, findReferences } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSkillInspector, inspectSkillFolder } from "../src/skills/checks";
import { hashDir } from "../src/util/hash";
import { type TestWorld, createTestWorld, writeFile } from "./helpers";

const codes = (issues: readonly SkillIssue[]): string[] => issues.map((issue) => issue.code);
const doc = (frontmatter: string, body = "Body\n"): string => `---\n${frontmatter}\n---\n${body}`;

describe("checking a SKILL.md", () => {
  it("accepts a well-formed skill", () => {
    const result = checkSkillDocument(doc("name: pdf\ndescription: Read PDFs."), "pdf");
    expect(result.issues).toEqual([]);
  });

  it("reports a missing document, frontmatter, name and description as errors", () => {
    expect(codes(checkSkillDocument(null, "pdf").issues)).toEqual(["document_missing"]);
    expect(codes(checkSkillDocument("# Just text\n", "pdf").issues)).toEqual([
      "frontmatter_missing",
    ]);
    const empty = checkSkillDocument(doc("license: MIT"), "pdf").issues;
    expect(codes(empty)).toEqual(["name_missing", "description_missing"]);
    expect(empty.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("reports YAML that does not parse, with the reason", () => {
    const [issue] = checkSkillDocument(doc("name: pdf\ndescription: [unclosed"), "pdf").issues;
    expect(issue).toMatchObject({ code: "frontmatter_invalid", severity: "error" });
    expect(String(issue?.params.reason)).not.toBe("");
    expect(codes(checkSkillDocument(doc("- just\n- a list"), "pdf").issues)).toEqual([
      "frontmatter_invalid",
    ]);
  });

  it("accepts a multi-line description", () => {
    const text = doc("name: pdf\ndescription: >\n  Read PDFs\n  and forms.");
    expect(checkSkillDocument(text, "pdf").issues).toEqual([]);
  });

  it("warns on names that break the naming rules or differ from the folder", () => {
    const issues = checkSkillDocument(doc("name: PDF--Tools\ndescription: x"), "pdf").issues;
    expect(codes(issues)).toEqual(["name_format", "name_mismatch"]);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
    const long = "a".repeat(65);
    expect(codes(checkSkillDocument(doc(`name: ${long}\ndescription: x`), long).issues)).toEqual([
      "name_too_long",
    ]);
  });

  it("warns on an overlong description, compatibility note or document", () => {
    const description = "d".repeat(1025);
    const compatibility = "c".repeat(501);
    const body = "line\n".repeat(500);
    const issues = checkSkillDocument(
      doc(`name: pdf\ndescription: ${description}\ncompatibility: ${compatibility}`, body),
      "pdf",
    ).issues;
    expect(codes(issues)).toEqual([
      "description_too_long",
      "compatibility_too_long",
      "document_too_long",
    ]);
  });
});

describe("links in SKILL.md", () => {
  it("collects relative links, and ignores web links, anchors and code", () => {
    const body = [
      "See [the guide](references/guide.md#setup) and ![chart](./assets/chart.png).",
      "Also [web](https://example.com), [mail](mailto:a@b.c), [top](#top), [abs](/etc/x).",
      "`[not a link](code.md)`",
      "```",
      "[also not](fenced.md)",
      "```",
      '[spaced](<my%20notes.md> "title")',
    ].join("\n");
    expect(findReferences(body)).toEqual({
      references: ["assets/chart.png", "my notes.md", "references/guide.md"],
      outside: [],
    });
  });

  it("flags links that climb out of the skill", () => {
    const result = checkSkillDocument(
      doc("name: pdf\ndescription: x", "[x](../other/SKILL.md)"),
      "pdf",
    );
    expect(result.issues).toMatchObject([
      { code: "broken_reference", params: { path: "../other/SKILL.md" } },
    ]);
  });
});

describe("checking library skills", () => {
  let world: TestWorld;
  beforeEach(() => {
    world = createTestWorld();
  });
  afterEach(() => world.cleanup());

  function addSkill(dirName: string, content: string, files: Record<string, string> = {}) {
    const libraryPath = join(world.ctx.paths.skillsDir, dirName);
    writeFile(join(libraryPath, "SKILL.md"), content);
    for (const [path, text] of Object.entries(files)) writeFile(join(libraryPath, path), text);
    return world.store.insert({
      name: dirName,
      description: null,
      sourceType: "local",
      libraryPath,
      contentHash: hashDir(libraryPath),
      updateStatus: "local_only",
    });
  }

  it("reports linked files that are missing", () => {
    const skill = addSkill(
      "pdf",
      doc("name: pdf\ndescription: x", "[ok](scripts/run.sh) [gone](references/missing.md)"),
      { "scripts/run.sh": "echo\n" },
    );
    expect(inspectSkillFolder(skill.libraryPath)).toMatchObject([
      { code: "broken_reference", params: { path: "references/missing.md" } },
    ]);
  });

  it("attaches the checks to every skill and looks again once the content changes", () => {
    const skill = addSkill("pdf", doc("name: pdf"));
    expect(codes(world.store.get(skill.id).issues)).toEqual(["description_missing"]);

    writeFile(join(skill.libraryPath, "SKILL.md"), doc("name: pdf\ndescription: Fixed."));
    world.store.update(skill.id, { contentHash: hashDir(skill.libraryPath) });
    expect(world.store.get(skill.id).issues).toEqual([]);
  });

  it("reuses the result while the content hash stays the same", () => {
    let runs = 0;
    const inspector = createSkillInspector(() => {
      runs += 1;
      return [];
    });
    const skill = { id: "a", libraryPath: "/x", contentHash: "h1" };
    inspector.issuesOf(skill);
    inspector.issuesOf(skill);
    expect(runs).toBe(1);
    inspector.issuesOf({ ...skill, contentHash: "h2" });
    expect(runs).toBe(2);
  });
});
