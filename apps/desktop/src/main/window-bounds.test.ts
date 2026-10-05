import { describe, expect, it } from "vitest";
import { WINDOW_VISIBLE_MIN_PX, isVisibleOn } from "./window-bounds";

const MAIN = { x: 0, y: 0, width: 1920, height: 1080 };
/** A second display to the left of the main one. */
const LEFT = { x: -1440, y: 0, width: 1440, height: 900 };
const SIZE = { width: 1320, height: 860 };

describe("isVisibleOn", () => {
  it("keeps a window inside a display", () => {
    expect(isVisibleOn({ x: 100, y: 50, ...SIZE }, [MAIN])).toBe(true);
    expect(isVisibleOn({ x: -1400, y: 20, ...SIZE }, [MAIN, LEFT])).toBe(true);
  });

  it("drops a window left of or above every display", () => {
    expect(isVisibleOn({ x: -1400, y: 20, ...SIZE }, [MAIN])).toBe(false);
    expect(isVisibleOn({ x: 100, y: -900, ...SIZE }, [MAIN])).toBe(false);
    expect(isVisibleOn({ x: -3000, y: 0, ...SIZE }, [MAIN, LEFT])).toBe(false);
  });

  it("drops a window right of or below every display", () => {
    expect(isVisibleOn({ x: 1900, y: 50, ...SIZE }, [MAIN])).toBe(false);
    expect(isVisibleOn({ x: 100, y: 1070, ...SIZE }, [MAIN])).toBe(false);
  });

  it("needs the minimum overlap on both axes", () => {
    const edge = { x: MAIN.width - WINDOW_VISIBLE_MIN_PX, y: 0, ...SIZE };
    expect(isVisibleOn(edge, [MAIN])).toBe(true);
    expect(isVisibleOn({ ...edge, x: edge.x + 1 }, [MAIN])).toBe(false);
    expect(isVisibleOn({ ...edge, y: MAIN.height - WINDOW_VISIBLE_MIN_PX + 1 }, [MAIN])).toBe(
      false,
    );
  });
});
