import type { DuplicatesReport } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * Library skills that may be one skill installed twice. Core remembers the last look until a
 * skill changes, so asking again after a deploy or a tag is cheap.
 */
export function useDuplicates(includeDismissed = false): UseQueryResult<DuplicatesReport> {
  return useQuery({
    queryKey: keys.skills.duplicates(includeDismissed),
    queryFn: () => api.duplicates.find({ includeDismissed }),
  });
}
