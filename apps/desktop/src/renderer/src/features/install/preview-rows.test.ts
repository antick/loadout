import {
  type InstallOutcome,
  type LibraryNameEntry,
  type RepoSkillPreview,
  filterPreviewRows,
  folderOf,
  groupPreviewRows,
  groupState,
  initialSelection,
  planInstallNames,
  showsGroups,
} from "@loadout/shared";
import { describe, expect, it } from "vitest";

function row(relPath: string, extra: Partial<RepoSkillPreview> = {}): RepoSkillPreview {
  const name = relPath.split("/").at(-1) ?? relPath;
  return {
    relPath,
    name,
    description: null,
    manualOnly: false,
    traits: [],
    alreadyInstalled: false,
    ...extra,
  };
}

function entry(dirName: string, extra: Partial<LibraryNameEntry> = {}): LibraryNameEntry {
  return {
    dirName,
    skillId: dirName,
    skillName: dirName,
    source: null,
    sameSource: false,
    ...extra,
  };
}

const kinds = (outcomes: readonly InstallOutcome[]): string[] => outcomes.map((o) => o.kind);

describe("planInstallNames", () => {
  it("says which names are free, already here from this source, or taken", () => {
    const library = [entry("pdf", { sameSource: true }), entry("Docx", { source: "acme/other" })];
    const outcomes = planInstallNames(["api", "pdf", "docx"], library);
    expect(kinds(outcomes)).toEqual(["new", "installed", "taken"]);
    expect(outcomes[1]?.installAs).toBe("pdf-2");
    // Letter case does not free a name: on macOS `docx` is the folder `Docx`.
    expect(outcomes[2]).toMatchObject({ installAs: "docx-2", owner: { source: "acme/other" } });
  });

  it("numbers past every name in use and past names earlier rows claim", () => {
    const library = [entry("pdf"), entry("pdf-2")];
    const outcomes = planInstallNames(["pdf", "pdf", "new", "new"], library);
    expect(kinds(outcomes)).toEqual(["taken", "repeated", "new", "repeated"]);
    expect(outcomes.map((o) => o.installAs)).toEqual(["pdf-3", "pdf-4", "new", "new-2"]);
  });

  it("lets an unticked row keep no name from the rows after it", () => {
    const outcomes = planInstallNames(["pdf", "pdf"], [], [false, true]);
    expect(kinds(outcomes)).toEqual(["new", "new"]);
  });
});

describe("preview list", () => {
  const rows = [row("skills/a"), row("skills/b"), row("extra/c"), row("top")];

  it("groups rows by parent folder, in order of first appearance", () => {
    expect(folderOf("skills/a")).toBe("skills");
    expect(folderOf("top")).toBe("");
    const groups = groupPreviewRows(rows);
    expect(groups.map((g) => [g.folder, g.rows.length])).toEqual([
      ["skills", 2],
      ["extra", 1],
      ["", 1],
    ]);
    expect(showsGroups(groups)).toBe(true);
    expect(showsGroups(groupPreviewRows([row("skills/a"), row("skills/b")]))).toBe(false);
  });

  it("filters on name, folder and description, ignoring case", () => {
    const described = [...rows, row("misc/d", { description: "Reads PDF files" })];
    expect(filterPreviewRows(described, "EXTRA").map((r) => r.relPath)).toEqual(["extra/c"]);
    expect(filterPreviewRows(described, "pdf").map((r) => r.relPath)).toEqual(["misc/d"]);
    expect(filterPreviewRows(described, "  ")).toHaveLength(described.length);
  });

  it("starts with free names ticked, or with what the typed text named", () => {
    const skills = [row("skills/a"), row("skills/b")];
    const outcomes = planInstallNames(["a", "b"], [entry("b")]);
    expect([...initialSelection({ skills, selected: null }, outcomes)]).toEqual(["skills/a"]);
    expect([...initialSelection({ skills, selected: ["skills/b"] }, outcomes)]).toEqual([
      "skills/b",
    ]);
    // Nothing is free: tick everything, as before, rather than open an empty choice.
    const taken = planInstallNames(["a", "b"], [entry("a"), entry("b")]);
    expect(initialSelection({ skills, selected: null }, taken).size).toBe(2);
  });

  it("reports a folder as ticked, partly ticked or not ticked", () => {
    const skills = [row("skills/a"), row("skills/b")];
    expect(groupState(skills, new Set())).toBe(false);
    expect(groupState(skills, new Set(["skills/a"]))).toBe("indeterminate");
    expect(groupState(skills, new Set(["skills/a", "skills/b"]))).toBe(true);
  });
});
