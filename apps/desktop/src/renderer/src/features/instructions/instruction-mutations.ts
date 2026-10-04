import type { InstructionFile, SkillLocation } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";

/** Create the empty instruction file a location points at, so it can be opened in the editor. */
export function useCreateInstructionFile(): UseMutationResult<
  InstructionFile,
  unknown,
  SkillLocation
> {
  return useApiMutation({
    fn: (location: SkillLocation) => api.instructions.create(location),
    error: "errors.createInstructionFile",
  });
}
