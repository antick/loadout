import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  DEFAULT_VIEW_MODE,
  type LibraryViewMode,
  STORAGE_KEYS,
  type ViewMode,
} from "@/lib/constants";

/**
 * Grid/list choice remembered per page (`scope` is e.g. "library"). A page that offers more views
 * names the type: `useViewMode<LibraryViewMode>("library")`. Grid is always the first choice.
 */
export function useViewMode<T extends LibraryViewMode = ViewMode>(
  scope: string,
): [T, (mode: T) => void] {
  return usePersistedState<T>(`${STORAGE_KEYS.viewMode}.${scope}`, DEFAULT_VIEW_MODE as T);
}
