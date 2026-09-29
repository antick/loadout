import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

export interface DismissDuplicateInput {
  idA: string;
  idB: string;
  /** False takes an earlier dismissal back. */
  dismissed: boolean;
}

/** Say two skills are not the same skill, so they stop being listed, or take that back. */
export function useDismissDuplicate(): UseMutationResult<void, unknown, DismissDuplicateInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idA, idB, dismissed }) =>
      dismissed ? api.duplicates.dismiss(idA, idB) : api.duplicates.undismiss(idA, idB),
    onError: (error) => toastError(error, "duplicates.errors.dismiss"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.skills.root }),
  });
}
