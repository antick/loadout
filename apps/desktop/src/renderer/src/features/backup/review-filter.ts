import type { SyncPreview, SyncPreviewItem } from "@loadout/shared";
import { matchesQuery } from "@/lib/utils";

/** The three lists of a review, each narrowed the same way. */
export interface ReviewLists {
  incoming: SyncPreviewItem[];
  outgoing: SyncPreviewItem[];
  conflicts: SyncPreviewItem[];
}

/** Every row of a review: changes both ways and conflicts. */
export function reviewSize(lists: ReviewLists): number {
  return lists.incoming.length + lists.outgoing.length + lists.conflicts.length;
}

/** The review's skills that fit the search: name, old folder name or device. */
export function filterReview(preview: SyncPreview, query: string): ReviewLists {
  const matches = (item: SyncPreviewItem): boolean =>
    matchesQuery(query, item.name, item.path, item.previousPath, item.fromDevice);
  return {
    incoming: preview.incoming.filter(matches),
    outgoing: preview.outgoing.filter(matches),
    conflicts: preview.conflicts.filter(matches),
  };
}
