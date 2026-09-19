import { ApiError } from "@skillboard/shared";
import { QueryClient } from "@tanstack/react-query";
import { QUERY_STALE_MS } from "@/lib/constants";

const MAX_RETRIES = 1;
/** Failures that will not fix themselves, so retrying only delays the error screen. */
const NO_RETRY_CODES = new Set(["NOT_FOUND", "INVALID_INPUT", "UNSUPPORTED", "CANCELLED"]);

/** The one QueryClient of the renderer. Freshness mostly comes from `data:changed` invalidation. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_MS,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && NO_RETRY_CODES.has(error.code)) return false;
        return failureCount < MAX_RETRIES;
      },
    },
    mutations: { retry: false },
  },
});
