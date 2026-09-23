import type { StorageReport } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every area Loadout keeps on disk, with its size. Measured fresh each time it is shown. */
export function useStorageReport(): UseQueryResult<StorageReport> {
  return useQuery({
    queryKey: keys.storage.report,
    queryFn: () => api.storage.report(),
    staleTime: 0,
  });
}
