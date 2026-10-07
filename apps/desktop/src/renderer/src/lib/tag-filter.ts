import { TAG_FILTER_UNTAGGED } from "@/lib/constants";

/** OR filter: no selection matches everything; "untagged" matches skills without tags. */
export function matchesTagFilter(tags: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  if (tags.length === 0) return selected.includes(TAG_FILTER_UNTAGGED);
  return tags.some((tag) => selected.includes(tag));
}

/**
 * The selected tags that still exist: one deleted, renamed or untagged from every skill
 * elsewhere (the CLI, another computer) would otherwise filter the list while no pill shows it.
 * Unchanged until the tags are known.
 */
export function existingTagFilters(
  selected: readonly string[],
  known: readonly string[] | undefined,
): readonly string[] {
  if (!known) return selected;
  return selected.filter((tag) => tag === TAG_FILTER_UNTAGGED || known.includes(tag));
}
