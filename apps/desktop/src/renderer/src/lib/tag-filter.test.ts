import { describe, expect, it } from "vitest";
import { TAG_FILTER_UNTAGGED } from "@/lib/constants";
import { existingTagFilters, tagSuggestions } from "@/lib/tag-filter";

describe("existingTagFilters", () => {
  it("drops a selected tag no skill has any more, and keeps untagged", () => {
    expect(existingTagFilters(["docs", "gone", TAG_FILTER_UNTAGGED], ["docs", "work"])).toEqual([
      "docs",
      TAG_FILTER_UNTAGGED,
    ]);
  });

  it("keeps the selection until the tags are known", () => {
    expect(existingTagFilters(["gone"], undefined)).toEqual(["gone"]);
  });
});

describe("tagSuggestions", () => {
  it("offers tags holding the typed text that are not there yet", () => {
    expect(tagSuggestions(["docs", "Dev", "work"], ["docs"], " d ")).toEqual(["Dev"]);
    expect(tagSuggestions(undefined, [], "")).toEqual([]);
  });
});
