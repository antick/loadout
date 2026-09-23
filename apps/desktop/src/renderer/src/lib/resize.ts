/** `value` held between `min` and `max`, rounded to a whole number. */
export function clampTo(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

/**
 * A percentage after a drag of `deltaPx` across a box `sizePx` long that started at `start`
 * percent. An unmeasured box (size 0) leaves it where it started.
 */
export function percentAfterDrag(start: number, deltaPx: number, sizePx: number): number {
  if (sizePx <= 0) return start;
  return start + (deltaPx / sizePx) * 100;
}

/**
 * The largest a side panel may be when `room` pixels are shared with a neighbour that needs
 * `keep` of them: never more than `max`, and never under `min` even when that squeezes the
 * neighbour.
 */
export function fitMax(room: number, keep: number, min: number, max: number): number {
  return clampTo(room - keep, min, max);
}

/**
 * The range a split may take, in percent, so that both sides of a box `sizePx` long keep at
 * least `minPanePx`, within `min`–`max`. A box too small for both keeps the middle.
 */
export function splitRange(
  sizePx: number,
  minPanePx: number,
  min: number,
  max: number,
): { min: number; max: number } {
  if (sizePx <= 0) return { min, max };
  const pane = (minPanePx / sizePx) * 100;
  if (pane >= 50) return { min: 50, max: 50 };
  // Whole percents, rounded inward, so neither side ends up a pixel short.
  return { min: Math.max(min, Math.ceil(pane)), max: Math.min(max, Math.floor(100 - pane)) };
}
