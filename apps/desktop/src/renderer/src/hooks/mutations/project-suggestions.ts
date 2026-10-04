import type { Skill } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";

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
  return useApiMutation({
    fn: async ({ projectId, skillIds, dismissed }: DismissSuggestionInput) => {
      for (const skillId of skillIds) {
        await api.projects.setSuggestionDismissed(projectId, skillId, dismissed);
      }
    },
    error: "projectPage.suggestedSkills.errors.dismiss",
  });
}

/** Replace the file patterns of projects a skill is suggested for. */
export function useSetSuggestFor(): UseMutationResult<
  Skill,
  unknown,
  { skillId: string; patterns: string[] }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, patterns }) => api.skills.setSuggestFor(skillId, patterns),
    success: () => t("library.suggestFor.saved"),
    error: "library.suggestFor.errors.save",
  });
}
