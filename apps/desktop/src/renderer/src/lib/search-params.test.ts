import { describe, expect, it } from "vitest";
import { optionalSearchText, searchText } from "@/lib/search-params";

describe("search parameters", () => {
  it("takes text and nothing else", () => {
    expect(searchText("pdf")).toBe("pdf");
    expect(searchText(3)).toBe("");
    expect(optionalSearchText("")).toBeUndefined();
    expect(optionalSearchText(["a"])).toBeUndefined();
    expect(optionalSearchText("a")).toBe("a");
  });
});
