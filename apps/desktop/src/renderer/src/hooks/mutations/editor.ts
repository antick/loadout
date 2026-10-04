import type { SaveSkillFileInput, SaveSkillFileResult, SkillLocation } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { locationKey } from "@/lib/skill-location";

export interface SaveSkillFileVariables {
  location: SkillLocation;
  input: SaveSkillFileInput;
}

/**
 * Save one file of a skill. No toasts: the editor reports the outcome itself, because a
 * CHANGED_ON_DISK refusal is a question for the user, not an error.
 */
export function useSaveSkillFile(): UseMutationResult<
  SaveSkillFileResult,
  unknown,
  SaveSkillFileVariables
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ location, input }: SaveSkillFileVariables) => api.editor.saveFile(location, input),
    error: false,
    onSuccess: (result, { location }) => {
      queryClient.setQueryData(
        keys.editor.file(locationKey(location), result.file.path),
        result.file,
      );
      if (result.skill) queryClient.setQueryData(keys.skills.detail(result.skill.id), result.skill);
    },
  });
}
