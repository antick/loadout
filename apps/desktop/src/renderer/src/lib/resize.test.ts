import { describe, expect, it } from "vitest";
import { clampTo, fitMax, percentAfterDrag, splitRange } from "./resize";

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

describe("fitMax", () => {
  it("leaves the neighbour the room it needs", () => {
    expect(fitMax(1252, 600, 200, 440)).toBe(440);
    expect(fitMax(892, 600, 200, 440)).toBe(292);
  });

  it("never goes under the panel's own minimum", () => {
    expect(fitMax(700, 600, 200, 440)).toBe(200);
  });
});

describe("splitRange", () => {
  it("keeps the preset range when the box is roomy", () => {
    expect(splitRange(2000, 280, 20, 80)).toEqual({ min: 20, max: 80 });
  });

  it("narrows the range so each side keeps its minimum", () => {
    expect(splitRange(800, 280, 20, 80)).toEqual({ min: 35, max: 65 });
  });

  it("rounds inward to whole percents", () => {
    expect(splitRange(996, 280, 20, 80)).toEqual({ min: 29, max: 71 });
  });

  it("holds the middle when both sides cannot fit", () => {
    expect(splitRange(500, 280, 20, 80)).toEqual({ min: 50, max: 50 });
  });

  it("keeps the preset range before the box is measured", () => {
    expect(splitRange(0, 280, 20, 80)).toEqual({ min: 20, max: 80 });
  });
});
