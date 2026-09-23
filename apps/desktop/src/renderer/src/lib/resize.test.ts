import { describe, expect, it } from "vitest";
import { clampTo, percentAfterDrag } from "./resize";

describe("clampTo", () => {
  it("holds a value inside the range and rounds it", () => {
    expect(clampTo(10, 20, 80)).toBe(20);
    expect(clampTo(95, 20, 80)).toBe(80);
    expect(clampTo(42.6, 20, 80)).toBe(43);
  });
});

describe("percentAfterDrag", () => {
  it("turns pixels dragged into a share of the box", () => {
    expect(percentAfterDrag(50, 100, 1000)).toBe(60);
    expect(percentAfterDrag(50, -250, 1000)).toBe(25);
  });

  it("stays put when the box has no size yet", () => {
    expect(percentAfterDrag(50, 100, 0)).toBe(50);
  });
});
