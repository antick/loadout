import { type QueryKey, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { type CacheSnapshot, patchCached, restoreCached } from "@/lib/optimistic";
import { sortByIds } from "@/lib/utils";

/**
 * Persist a new order of a cached list, given as every id in the new order. The list is
 * reordered at once and put back if the backend refuses.
 */
export function useReorderMutation<T>(
  key: QueryKey,
  fn: (ids: string[]) => Promise<void>,
  idOf: (item: T) => string,
): UseMutationResult<void, unknown, string[], CacheSnapshot> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn,
    onMutate: (ids) => patchCached<T[]>(queryClient, key, (items) => sortByIds(items, ids, idOf)),
    error: "errors.reorder",
    onError: (_error, _ids, context) => restoreCached(queryClient, context),
  });
}
