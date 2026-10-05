import type { DuplicatesReport } from "@loadout/shared";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

export interface DuplicatesQuery {
  includeDismissed?: boolean;
  /** Compare the skills' text as well: slow on a big library, so only when the person asks. */
  similarText?: boolean;
}

/**
 * Library skills that may be one skill installed twice. Core remembers the last look until a
 * skill changes, so asking again after a deploy or a tag is cheap. While a look at the text runs,
 * the quicker answer stays on screen.
 */
export function useDuplicates({
  includeDismissed = false,
  similarText = false,
}: DuplicatesQuery = {}): UseQueryResult<DuplicatesReport> {
  return useQuery({
    queryKey: keys.duplicates.find(includeDismissed, similarText),
    queryFn: () => api.duplicates.find({ includeDismissed, similarText }),
    placeholderData: keepPreviousData,
  });
}
