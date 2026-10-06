import { ApiError } from "@loadout/shared";
import { QueryClient } from "@tanstack/react-query";
import { QUERY_STALE_MS } from "@/lib/constants";

const MAX_RETRIES = 1;
/** Failures that will not fix themselves, so retrying only delays the error screen. */
const NO_RETRY_CODES = new Set(["NOT_FOUND", "INVALID_INPUT", "UNSUPPORTED", "CANCELLED"]);

/**
 * The one QueryClient of the renderer. Freshness comes from `data:changed` invalidation: the
 * library, agent and project folders are watched, so coming back to the window refetches only
 * what no watcher can see (which agents are installed, the backup remote; see `REFETCH_ON_FOCUS`).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_MS,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && NO_RETRY_CODES.has(error.code)) return false;
        return failureCount < MAX_RETRIES;
      },
    },
    mutations: { retry: false },
  },
});

/** For the few queries whose truth no folder watcher sees: asked again when the window is back. */
export const REFETCH_ON_FOCUS = { refetchOnWindowFocus: true } as const;
