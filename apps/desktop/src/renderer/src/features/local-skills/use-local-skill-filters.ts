import { useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { matchesTagFilter } from "@/lib/tag-filter";
import { matchesQuery } from "@/lib/utils";
import type { LocalSkillView } from "./local-skill-view";

export interface LocalSkillFilters<T extends LocalSkillView> {
  query: string;
  setQuery(query: string): void;
  tagFilter: string[];
  setTagFilter(tags: string[]): void;
  /** Every tag used by the unfiltered list, sorted. */
  availableTags: string[];
  /** Some entry has no tags, so the "Untagged" pill is worth showing. */
  hasUntagged: boolean;
  filtered: T[];
  /** A search, a tag or the caller's own filter is narrowing the list. */
  isFiltering: boolean;
  reset(): void;
}

/**
 * Search + tag filter over a list of local skills, keeping the list's order. `extra` is the
 * page's own filter (e.g. enabled / disabled); pass `extraActive` so the empty state can tell
 * "nothing here" from "nothing matches".
 */
export function useLocalSkillFilters<T extends LocalSkillView>(
  items: readonly T[],
  extra?: (item: T) => boolean,
  extraActive = false,
): LocalSkillFilters<T> {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const debouncedQuery = useDebouncedValue(query);

  const availableTags = useMemo(
    () => [...new Set(items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const hasUntagged = useMemo(() => items.some((item) => item.tags.length === 0), [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesQuery(debouncedQuery, item.name, item.description, item.relativePath) &&
          matchesTagFilter(item.tags, tagFilter) &&
          (extra ? extra(item) : true),
      ),
    [items, debouncedQuery, tagFilter, extra],
  );

  return {
    query,
    setQuery,
    tagFilter,
    setTagFilter,
    availableTags,
    hasUntagged,
    filtered,
    isFiltering: query.trim().length > 0 || tagFilter.length > 0 || extraActive,
    reset: () => {
      setQuery("");
      setTagFilter([]);
    },
  };
}
