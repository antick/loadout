import type { SyncChange, SyncPreview, SyncPreviewItem } from "@loadout/shared";
import { matchesQuery } from "@/lib/utils";

/** What the sync review can be narrowed to: one kind of change, or the skills changed on both. */
export type ReviewFilter = "all" | SyncChange | "conflict";

/** In the order the filter menu lists them. */
export const REVIEW_FILTERS: readonly ReviewFilter[] = [
  "all",
  "added",
  "changed",
  "renamed",
  "details",
  "deleted",
  "conflict",
];

/** The three lists of a review, each narrowed the same way. */
export interface ReviewLists {
  incoming: SyncPreviewItem[];
  outgoing: SyncPreviewItem[];
  conflicts: SyncPreviewItem[];
}

function matches(
  item: SyncPreviewItem,
  kind: ReviewFilter,
  query: string,
  filter: ReviewFilter,
): boolean {
  if (filter !== "all" && filter !== kind) return false;
  return matchesQuery(query, item.name, item.path, item.previousPath, item.fromDevice);
}

/** The review's skills that fit the search and the filter. */
export function filterReview(
  preview: SyncPreview,
  query: string,
  filter: ReviewFilter,
): ReviewLists {
  return {
    incoming: preview.incoming.filter((item) => matches(item, item.change, query, filter)),
    outgoing: preview.outgoing.filter((item) => matches(item, item.change, query, filter)),
    conflicts: preview.conflicts.filter((item) => matches(item, "conflict", query, filter)),
  };
}

/** How many skills each filter would show; `all` counts every row of the review. */
export function countReview(preview: SyncPreview): Record<ReviewFilter, number> {
  const counts = Object.fromEntries(REVIEW_FILTERS.map((filter) => [filter, 0])) as Record<
    ReviewFilter,
    number
  >;
  for (const item of [...preview.incoming, ...preview.outgoing]) counts[item.change] += 1;
  counts.conflict = preview.conflicts.length;
  counts.all = preview.incoming.length + preview.outgoing.length + preview.conflicts.length;
  return counts;
}
