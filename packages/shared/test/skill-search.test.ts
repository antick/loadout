import { matchesNamedQuery, matchesSkillQuery } from "@loadout/shared";
import { describe, expect, it } from "vitest";

const skill = (name: string, description = "", tags: string[] = []) => ({
  name,
  description,
  tags,
  sourceRef: null,
  sourceUrl: null,
});

/** A one-word query on a name alone matches only through the starts of the name's parts. */
const matchesNameParts = (name: string, word: string): boolean => matchesNamedQuery(name, [], word);

describe("matchesNameParts", () => {
  it("matches the starts of the name's parts, in order", () => {
    expect(matchesNameParts("pdf-manipulation", "pdfm")).toBe(true);
    expect(matchesNameParts("pdf-manipulation", "pdfmanip")).toBe(true);
    expect(matchesNameParts("release-notes", "rn")).toBe(true);
    expect(matchesNameParts("code-review", "cr")).toBe(true);
    expect(matchesNameParts("git_commit.helper", "gch")).toBe(true);
    expect(matchesNameParts("frontend-design-system", "fds")).toBe(true);
    expect(matchesNameParts("frontend-design-system", "fs")).toBe(true);
  });

  it("does not match letters from the middle of a part or out of order", () => {
    expect(matchesNameParts("commit-helper", "cr")).toBe(false);
    expect(matchesNameParts("release-notes", "nr")).toBe(false);
    expect(matchesNameParts("pdf-tools", "dft")).toBe(false);
  });
});

describe("matchesSkillQuery", () => {
  const pdf = skill("pdf-manipulation", "Merge and split PDF files", ["documents"]);

  it("keeps the plain text search", () => {
    expect(matchesSkillQuery(pdf, "")).toBe(true);
    expect(matchesSkillQuery(pdf, "SPLIT PDF")).toBe(true);
    expect(matchesSkillQuery(pdf, "docu")).toBe(true);
    expect(matchesSkillQuery(pdf, "spreadsheet")).toBe(false);
  });

  it("finds a skill by the starts of its name's parts", () => {
    expect(matchesSkillQuery(pdf, "pdfm")).toBe(true);
    expect(matchesSkillQuery(skill("release-notes"), "rn")).toBe(true);
  });

  it("needs every word, in any order and any field", () => {
    expect(matchesSkillQuery(pdf, "files merge")).toBe(true);
    expect(matchesSkillQuery(pdf, "pdfm documents")).toBe(true);
    expect(matchesSkillQuery(pdf, "files spreadsheet")).toBe(false);
  });
});

describe("matchesNamedQuery", () => {
  it("searches any list of skills the way the library is searched", () => {
    const folder = ["Fills in forms", ".claude/skills/pdf-form-filler"];
    expect(matchesNamedQuery("pdf-form-filler", folder, "pff")).toBe(true);
    expect(matchesNamedQuery("pdf-form-filler", folder, "forms pdf")).toBe(true);
    expect(matchesNamedQuery("pdf-form-filler", folder, ".claude/skills")).toBe(true);
    expect(matchesNamedQuery("pdf-form-filler", folder, "sheet")).toBe(false);
    expect(matchesNamedQuery("pdf-form-filler", [null, undefined], "")).toBe(true);
  });
});
