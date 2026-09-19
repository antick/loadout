import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Items in the order of `ids`; anything not listed keeps its place at the end. */
export function sortByIds<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const last = Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last));
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
