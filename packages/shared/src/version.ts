/** Numeric parts of a version: "v1.2.3-beta" → [1, 2, 3, 0]. Anything not a number counts as 0. */
function versionParts(text: string): number[] {
  return text
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** True when `candidate` is a later version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
