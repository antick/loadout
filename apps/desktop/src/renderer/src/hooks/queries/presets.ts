import type { Preset } from "@skillboard/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every preset in sidebar order. */
export function usePresets(): UseQueryResult<Preset[]> {
  return useQuery({ queryKey: keys.presets.all, queryFn: () => api.presets.list() });
}
