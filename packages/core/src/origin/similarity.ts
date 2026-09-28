/**
 * How alike two texts are, 0 to 1: twice the lines they share in order, over all their lines.
 * Blank lines and trailing spaces do not count, nor do line endings. Past a size where the
 * comparison gets slow, shared lines are counted regardless of order.
 */

/** Lines per side up to which the in-order comparison runs (its work grows with the product). */
const MAX_ORDERED_LINES = 2000;

function linesOf(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

/** Length of the longest run of lines both have in the same order. */
function sharedInOrder(a: readonly string[], b: readonly string[]): number {
  let previous = Array.from({ length: b.length + 1 }, () => 0);
  for (const line of a) {
    const current = Array.from({ length: b.length + 1 }, () => 0);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        line === b[j - 1]
          ? (previous[j - 1] ?? 0) + 1
          : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function sharedAnyOrder(a: readonly string[], b: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
  let shared = 0;
  for (const line of b) {
    const left = counts.get(line) ?? 0;
    if (left === 0) continue;
    counts.set(line, left - 1);
    shared += 1;
  }
  return shared;
}

export function textSimilarity(left: string, right: string): number {
  const a = linesOf(left);
  const b = linesOf(right);
  const total = a.length + b.length;
  if (total === 0) return 1;
  const small = a.length <= MAX_ORDERED_LINES && b.length <= MAX_ORDERED_LINES;
  const shared = small ? sharedInOrder(a, b) : sharedAnyOrder(a, b);
  return (2 * shared) / total;
}
