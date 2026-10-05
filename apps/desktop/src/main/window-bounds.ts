import type { Rectangle } from "electron";

/**
 * At least this much of the window must lie inside some display's work area for its saved
 * position to be used again: enough of the title bar to grab, on a display that is still there.
 */
export const WINDOW_VISIBLE_MIN_PX = 64;

/** Whether `bounds` overlaps one of the `areas` by at least the minimum on both axes. */
export function isVisibleOn(bounds: Rectangle, areas: readonly Rectangle[]): boolean {
  return areas.some((area) => {
    const width =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const height =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return width >= WINDOW_VISIBLE_MIN_PX && height >= WINDOW_VISIBLE_MIN_PX;
  });
}
