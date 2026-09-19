import { usePersistedState } from "@/hooks/use-persisted-state";
import { DEFAULT_VIEW_MODE, STORAGE_KEYS, type ViewMode } from "@/lib/constants";

/** Grid/list choice remembered per page (`scope` is e.g. "library"). */
export function useViewMode(scope: string): [ViewMode, (mode: ViewMode) => void] {
  return usePersistedState<ViewMode>(`${STORAGE_KEYS.viewMode}.${scope}`, DEFAULT_VIEW_MODE);
}
