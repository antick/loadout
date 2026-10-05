import { describe, expect, it } from "vitest";
import { groupLibraryBySource } from "@/features/library/library-groups";
import { skill } from "@/test/skill";

const REPO = "https://github.com/acme/skills.git";

describe("groupLibraryBySource", () => {
  it("groups by source in label order, keeps list order inside, and ends with loose skills", () => {
    const skills = [
      skill("mine"),
      skill("zip", { sourceType: "local", sourceRef: "/downloads/pack.zip" }),
      skill("pdf", { sourceType: "git", sourceUrl: REPO }),
      skill("docx", { sourceType: "git", sourceUrl: REPO }),
      skill("one", { sourceType: "clawhub", sourceRef: "@ada/one" }),
      skill("two", { sourceType: "clawhub", sourceRef: "@bob/two" }),
    ];
    const groups = groupLibraryBySource(skills);
    expect(groups.map((group) => group.source?.kind ?? null)).toEqual([
      "repository",
      "registry",
      "archive",
      null,
    ]);
    expect(groups.map((group) => group.skills.map((entry) => entry.id))).toEqual([
      ["pdf", "docx"],
      ["one", "two"],
      ["zip"],
      ["mine"],
    ]);
  });

  it("has no loose group when every skill has a source", () => {
    const groups = groupLibraryBySource([skill("pdf", { sourceType: "git", sourceUrl: REPO })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.source?.label).toBe("acme/skills");
  });
});
