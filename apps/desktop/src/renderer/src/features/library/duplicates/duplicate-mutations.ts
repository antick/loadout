import type { UseMutationResult } from "@tanstack/react-query";
import { type ApiMutationOptions, useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

export interface DismissDuplicateInput {
  idA: string;
  idB: string;
  /** False takes an earlier dismissal back. */
  dismissed: boolean;
}

/** Only the list of pairs changes: no skill does, so nothing else is asked for again. */
export const dismissDuplicateOptions: ApiMutationOptions<void, DismissDuplicateInput, unknown> = {
  fn: ({ idA, idB, dismissed }) =>
    dismissed ? api.duplicates.dismiss(idA, idB) : api.duplicates.undismiss(idA, idB),
  error: "duplicates.errors.dismiss",
  invalidate: [keys.duplicates.root],
};

/** Say two skills are not the same skill, so they stop being listed, or take that back. */
export function useDismissDuplicate(): UseMutationResult<void, unknown, DismissDuplicateInput> {
  return useApiMutation(dismissDuplicateOptions);
}
