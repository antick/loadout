import type { SyncPreview } from "@loadout/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * Whether the library changed since `review` was worked out: its current git tree id is asked
 * for and compared with the one the review saw. Every library change (`data:changed` for skills,
 * presets or the backup) refetches it, so changes in agents' folders or settings never raise it
 * by mistake. `busy`: a review or a sync is running; the question waits until it is done.
 */
export function useReviewStale(review: SyncPreview | null, busy: boolean): boolean {
  const reviewTree = review?.localTree ?? null;
  const tree = useQuery({
    queryKey: keys.backup.localTree(reviewTree ?? ""),
    queryFn: () => api.backup.localTree(),
    enabled: reviewTree !== null && !busy,
    // Only a hint for the user; the sync itself never relies on it.
    retry: false,
  });
  return reviewTree !== null && tree.data !== undefined && tree.data !== reviewTree;
}
