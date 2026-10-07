/** Small text helpers shared across features. */

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** `text` as a regular expression source that matches it literally. */
export function escapeRegExp(text: string): string {
  return text.replace(REGEXP_SPECIAL, "\\$&");
}

/** Between the parts of a place shown to people: `my-app · Claude Code`. */
export const PLACE_SEPARATOR = " · ";

/** Byte-order comparison for `Array.prototype.sort` on strings. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
