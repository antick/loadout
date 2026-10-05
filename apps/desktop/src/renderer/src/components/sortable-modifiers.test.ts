import type { ClientRect, Modifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
  translateCss,
} from "@/components/sortable-modifiers";

const rect = (top: number, height: number, left = 0, width = 100): ClientRect => ({
  top,
  left,
  width,
  height,
  bottom: top + height,
  right: left + width,
});

const args = (
  transform: { x: number; y: number },
  dragging: ClientRect | null,
  container: ClientRect | null,
): Parameters<Modifier>[0] =>
  ({
    transform: { ...transform, scaleX: 1, scaleY: 1 },
    draggingNodeRect: dragging,
    containerNodeRect: container,
  }) as Parameters<Modifier>[0];

describe("sortable list modifiers", () => {
  it("keeps a row on the vertical axis", () => {
    expect(restrictToVerticalAxis(args({ x: 30, y: 12 }, null, null))).toMatchObject({
      x: 0,
      y: 12,
    });
  });

  it("stops a row at the top and bottom of its list", () => {
    const list = rect(0, 100);
    expect(restrictToParentElement(args({ x: 0, y: -50 }, rect(20, 10), list)).y).toBe(-20);
    expect(restrictToParentElement(args({ x: 0, y: 500 }, rect(20, 10), list)).y).toBe(70);
    expect(restrictToParentElement(args({ x: 0, y: 30 }, rect(20, 10), list)).y).toBe(30);
  });

  it("leaves the offset alone before the rectangles are measured", () => {
    expect(restrictToParentElement(args({ x: 5, y: 500 }, null, rect(0, 100)))).toMatchObject({
      x: 5,
      y: 500,
    });
  });

  it("writes the offset as a whole-pixel translate", () => {
    expect(translateCss({ x: 0.4, y: 12.6 })).toBe("translate3d(0px, 13px, 0)");
    expect(translateCss(null)).toBeUndefined();
  });
});
