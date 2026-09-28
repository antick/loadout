import { describe, expect, it } from "vitest";
import { isExact, matchLabel, matchTone } from "./source-candidate";

describe("source candidate labels", () => {
  it("says same files, how many files differ, or how alike the document is", () => {
    expect(matchLabel({ match: "identical", similarity: 1, changedFiles: [] })).toEqual({
      key: "origin.match.identical",
      values: {},
    });
    expect(matchLabel({ match: "similar", similarity: 0.95, changedFiles: ["a", "b"] })).toEqual({
      key: "origin.match.similar",
      values: { count: 2 },
    });
    expect(matchLabel({ match: "different", similarity: 0.426, changedFiles: ["a"] })).toEqual({
      key: "origin.match.different",
      values: { percent: 43 },
    });
  });

  it("marks only an identical copy as safe", () => {
    expect(matchTone({ match: "identical" })).toBe("success");
    expect(matchTone({ match: "similar" })).toBe("warning");
    expect(matchTone({ match: "different" })).toBe("neutral");
    expect(isExact(undefined)).toBe(false);
  });
});
