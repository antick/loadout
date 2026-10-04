import type { ActivityEntry } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** The newest entries of the activity log. */
export function useActivity(limit: number): UseQueryResult<ActivityEntry[]> {
  return useQuery({
    queryKey: keys.system.activity(limit),
    queryFn: () => api.system.activity(limit),
  });
}
