import type { LibraryItem } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every library item, for counts. */
export function useAllItems(): UseQueryResult<LibraryItem[]> {
  return useQuery({ queryKey: keys.items.list(""), queryFn: () => api.items.list() });
}
