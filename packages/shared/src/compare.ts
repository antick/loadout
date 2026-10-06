/**
 * Order for names a person reads (skills, tags, sources, files): the system's collation, letter
 * case and accents ignored. Core's `compareText` stays byte order, for output that must not vary.
 */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}
