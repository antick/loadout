import type { ProjectSuggestions } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Library skills worth adding to a project, from its files. */
export function useProjectSkillSuggestions(
  projectId: string | null | undefined,
): UseQueryResult<ProjectSuggestions> {
  return useQuery({
    queryKey: keys.projects.skillSuggestions(projectId ?? ""),
    queryFn: () => api.projects.suggestSkills(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}
