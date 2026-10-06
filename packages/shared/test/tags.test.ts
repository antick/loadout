import { describe, expect, it } from "vitest";
import { editTags } from "../src/tags";

describe("editTags", () => {
  it("keeps the skill's own order, adds new tags after, and ignores letter case", () => {
    expect(editTags(["work", "pdf"], ["Docs", "WORK"], ["PDF"])).toEqual(["work", "Docs"]);
    expect(editTags(["a"], [" ", "b "], [])).toEqual(["a", "b"]);
  });
});
