import type { UseMutationResult } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { GENERIC_ERROR_KEY } from "@/lib/toast";

/** Hide the agent-control suggestion for good. */
export function useDismissAgentControl(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.system.dismissAgentControl(),
    error: GENERIC_ERROR_KEY,
  });
}
