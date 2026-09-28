import type { Skill } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

export interface DismissSuggestionInput {
  projectId: string;
  /** Skill ids; one or several at once. */
  skillIds: readonly string[];
  dismissed: boolean;
}

/** Stop suggesting skills for a project, or start again. */
export function useSetSuggestionDismissed(): UseMutationResult<
  void,
  unknown,
  DismissSuggestionInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, skillIds, dismissed }: DismissSuggestionInput) => {
      for (const skillId of skillIds) {
        await api.projects.setSuggestionDismissed(projectId, skillId, dismissed);
      }
    },
    onError: (error) => toastError(error, "projectPage.suggestedSkills.errors.dismiss"),
    onSettled: (_result, _error, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: keys.projects.skillSuggestions(projectId) }),
  });
}

/** Replace the file patterns of projects a skill is suggested for. */
export function useSetSuggestFor(): UseMutationResult<
  Skill,
  unknown,
  { skillId: string; patterns: string[] }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ skillId, patterns }) => api.skills.setSuggestFor(skillId, patterns),
    onSuccess: () => toastSuccess(t("library.suggestFor.saved")),
    onError: (error) => toastError(error, "library.suggestFor.errors.save"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.skills.root });
      void queryClient.invalidateQueries({ queryKey: keys.projects.root });
    },
  });
}
