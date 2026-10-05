/**
 * How alike two texts are, 0 to 1: twice the lines they share in order, over all their lines.
 * Blank lines and trailing spaces do not count, nor do line endings. Past a size where the
 * comparison gets slow, shared lines are counted regardless of order.
 */

/** Lines per side up to which the in-order comparison runs (its work grows with the product). */
const MAX_ORDERED_LINES = 2000;

/** The lines of a text as they are compared. */
export function comparedLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

/**
 * Length of the longest run of lines both have in the same order. Lines both start or end with
 * are counted first, so near copies compare only the part where they differ.
 */
function sharedInOrder<T>(a: readonly T[], b: readonly T[]): number {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const fixed = start + (a.length - endA);
  const width = endB - start;
  let previous = new Int32Array(width + 1);
  let current = new Int32Array(width + 1);
  for (let i = start; i < endA; i += 1) {
    const line = a[i];
    for (let j = 1; j <= width; j += 1) {
      current[j] =
        line === b[start + j - 1]
          ? (previous[j - 1] ?? 0) + 1
          : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    [previous, current] = [current, previous];
  }
  return fixed + (previous[width] ?? 0);
}

/** How often each line occurs: what `sharedCount` compares. */
export function lineCounts<T>(lines: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/** Lines both hold, regardless of order: never fewer than they share in order. */
export function sharedCount<T>(
  left: ReadonlyMap<T, number>,
  right: ReadonlyMap<T, number>,
): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const [line, count] of small) shared += Math.min(count, large.get(line) ?? 0);
  return shared;
}

/** `textSimilarity` of texts already split by `comparedLines` (or lines mapped to numbers). */
export function linesSimilarity<T>(a: readonly T[], b: readonly T[]): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  const small = a.length <= MAX_ORDERED_LINES && b.length <= MAX_ORDERED_LINES;
  const shared = small ? sharedInOrder(a, b) : sharedCount(lineCounts(a), lineCounts(b));
  return (2 * shared) / total;
}

export function textSimilarity(left: string, right: string): number {
  return linesSimilarity(comparedLines(left), comparedLines(right));
}
