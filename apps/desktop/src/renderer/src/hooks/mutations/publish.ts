import type { PublishInput, PublishPlan, PublishResult } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * Look at the repository and say what publishing would do. Errors are shown in the dialog next to
 * the address that caused them, so there is no toast here.
 */
export function usePublishPreview(): UseMutationResult<PublishPlan, unknown, PublishInput> {
  return useMutation({ mutationFn: (input) => api.publish.preview(input) });
}

/** Copy the skills into the repository and push. Errors stay in the dialog too. */
export function usePublishSkills(): UseMutationResult<PublishResult, unknown, PublishInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.publish.publish(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.publish.root });
      void queryClient.invalidateQueries({ queryKey: keys.system.root });
    },
  });
}
