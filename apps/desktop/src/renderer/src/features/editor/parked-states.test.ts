import { describe, expect, it } from "vitest";
import { parkState } from "@/features/editor/parked-states";

const NONE: ReadonlySet<string> = new Set();

describe("parked editor states", () => {
  it("keeps only the most recently left documents", () => {
    const parked = new Map<string, number>();
    for (const [index, key] of ["a", "b", "c"].entries()) parkState(parked, key, index, 2, NONE);
    expect([...parked.keys()]).toEqual(["b", "c"]);
  });

  it("counts a document left again as the newest", () => {
    const parked = new Map<string, number>();
    parkState(parked, "a", 1, 2, NONE);
    parkState(parked, "b", 2, 2, NONE);
    parkState(parked, "a", 3, 2, NONE);
    parkState(parked, "c", 4, 2, NONE);
    expect([...parked.entries()]).toEqual([
      ["a", 3],
      ["c", 4],
    ]);
  });

  it("never drops a document with unsaved changes", () => {
    const parked = new Map<string, number>();
    const unsaved = new Set(["a"]);
    for (const [index, key] of ["a", "b", "c", "d"].entries()) {
      parkState(parked, key, index, 2, unsaved);
    }
    expect([...parked.keys()]).toEqual(["a", "d"]);
  });
});
