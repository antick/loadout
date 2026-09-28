import type { SourceNews } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** New skills each repository gained, as the last check found them. No network. */
export function useSourceNews(): UseQueryResult<SourceNews[]> {
  return useQuery({ queryKey: keys.updates.news, queryFn: () => api.updates.sourceNews() });
}
