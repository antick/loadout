import type { SaveSkillFileInput, SaveSkillFileResult } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

export interface SaveSkillFileVariables {
  skillId: string;
  input: SaveSkillFileInput;
}

/**
 * Save one file of a library skill. No toasts: the editor reports the outcome itself, because a
 * CHANGED_ON_DISK refusal is a question for the user, not an error.
 */
export function useSaveSkillFile(): UseMutationResult<
  SaveSkillFileResult,
  unknown,
  SaveSkillFileVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, input }: SaveSkillFileVariables) => api.skills.saveFile(skillId, input),
    onSuccess: (result, { skillId }) => {
      queryClient.setQueryData(keys.skills.file(skillId, result.file.path), result.file);
      queryClient.setQueryData(keys.skills.detail(skillId), result.skill);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.skills.root }),
  });
}
