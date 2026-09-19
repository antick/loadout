import { TAG_FILTER_UNTAGGED } from "@/lib/constants";

/** OR filter: no selection matches everything; "untagged" matches skills without tags. */
export function matchesTagFilter(tags: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  if (tags.length === 0) return selected.includes(TAG_FILTER_UNTAGGED);
  return tags.some((tag) => selected.includes(tag));
}
