import type { InstructionFile, SkillLocation } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

/** Create the empty instruction file a location points at, so it can be opened in the editor. */
export function useCreateInstructionFile(): UseMutationResult<
  InstructionFile,
  unknown,
  SkillLocation
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (location: SkillLocation) => api.instructions.create(location),
    onError: (error) => toastError(error, "errors.createInstructionFile"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.instructions.root }),
  });
}
