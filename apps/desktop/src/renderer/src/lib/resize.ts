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
