import { describe, expect, it } from "vitest";
import { pruneSelected, toggledSelection } from "@/hooks/use-selection";
import { setMany } from "@/lib/sets";

const ALL = ["a", "b", "c", "d"];

describe("selection state", () => {
  it("keeps ticks hidden by a search when they are still in the kept ids", () => {
    // The picker: tick a, search for b (only b shown), tick b. Both stay ticked.
    let selected = toggledSelection(new Set(), ALL, null, "a");
    selected = pruneSelected(selected, ALL);
    selected = toggledSelection(selected, ["b"], "a", "b");
    expect([...pruneSelected(selected, ALL)].sort()).toEqual(["a", "b"]);
  });

  it("drops ticks that leave the list when the list itself is what is kept", () => {
    // The Library page: filtering a skill out unticks it.
    const selected = new Set(["a", "b"]);
    expect([...pruneSelected(selected, ["b", "c"])]).toEqual(["b"]);
    expect(pruneSelected(selected, ALL)).toBe(selected);
  });

  it("selects a shift-range only within the shown ids", () => {
    const shown = ["a", "c", "d"];
    const selected = toggledSelection(new Set(["b"]), shown, "a", "d", true);
    expect([...selected].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("ticks and unticks the shown ids, leaving the hidden ticks alone", () => {
    const ticked = setMany(new Set(["a"]), ["c", "d"], true);
    expect([...ticked].sort()).toEqual(["a", "c", "d"]);
    expect([...setMany(ticked, ["c", "d"], false)]).toEqual(["a"]);
  });
});
