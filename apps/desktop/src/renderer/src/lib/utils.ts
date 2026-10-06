import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Font sizes `globals.css` adds to the theme (`--text-*`). Told to tailwind-merge so `cn` keeps
 * `text-caption` next to a colour such as `text-muted-foreground` instead of taking it for one.
 */
const THEME_TEXT_SIZES = ["3xs", "2xs", "caption", "page-subtitle", "page-title"];

const twMerge = extendTailwindMerge({ extend: { theme: { text: THEME_TEXT_SIZES } } });

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Items in the order of `ids`; anything not listed keeps its place at the end. */
export function sortByIds<T>(
  items: readonly T[],
  ids: readonly string[],
  idOf: (item: T) => string,
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const last = Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => (rank.get(idOf(a)) ?? last) - (rank.get(idOf(b)) ?? last));
}

/** Case-insensitive "does any of these fields contain the query". Empty query matches all. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/** Ids with one entry moved one step up (-1) or down (+1); unchanged at the ends. */
export function moveId(ids: readonly string[], id: string, step: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  const next = [...ids];
  if (from === -1 || to < 0 || to >= ids.length) return next;
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * A stable React key per item from a label that may repeat: `name`, `name#2`, `name#3`. For lists
 * whose items have no id of their own (untrusted text can repeat a label).
 */
export function occurrenceKeys<T>(items: readonly T[], label: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = label(item);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}
