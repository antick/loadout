import { describe, expect, it } from "vitest";
import { setMany, toggleIn } from "@/lib/sets";

describe("set helpers", () => {
  it("toggles one id without touching the original", () => {
    const original = new Set(["a"]);
    expect([...toggleIn(original, "b")]).toEqual(["a", "b"]);
    expect([...toggleIn(original, "a")]).toEqual([]);
    expect([...original]).toEqual(["a"]);
  });

  it("ticks or unticks many ids at once", () => {
    const original = new Set(["a", "b"]);
    expect([...setMany(original, ["b", "c"], true)]).toEqual(["a", "b", "c"]);
    expect([...setMany(original, ["b", "c"], false)]).toEqual(["a"]);
    expect([...original]).toEqual(["a", "b"]);
  });
});
