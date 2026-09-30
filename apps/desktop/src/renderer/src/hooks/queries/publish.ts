import type { PublishTarget } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Where skills were last published, to fill the publish form with. Null before the first time. */
export function usePublishDefaults(): UseQueryResult<PublishTarget | null> {
  return useQuery({ queryKey: keys.publish.defaults, queryFn: () => api.publish.defaults() });
}
