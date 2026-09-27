/** "v1.2.3-rc.1" → numbers [1, 2, 3] and pre-release parts ["rc", "1"]. */
function versionParts(text: string): { numbers: number[]; pre: string[] } {
  const [core = "", ...rest] = text.trim().replace(/^v/i, "").split("-");
  const pre = rest.join("-");
  return {
    numbers: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
    pre: pre ? pre.split(".") : [],
  };
}

/** Pre-release parts compared the semver way: numbers as numbers, below words. */
function comparePre(a: string[], b: string[]): number {
  // A release comes after every pre-release of the same version.
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) return left === undefined ? -1 : 1;
    const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
    const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    } else if (leftNumber !== null || rightNumber !== null) {
      return leftNumber !== null ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

/** True when `candidate` is a later version than `current`. `1.2.3-rc.1` is before `1.2.3`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i += 1) {
    const diff = (a.numbers[i] ?? 0) - (b.numbers[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return comparePre(a.pre, b.pre) > 0;
}
