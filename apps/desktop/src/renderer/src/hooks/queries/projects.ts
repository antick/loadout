import type { Project, ProjectSuggestion } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every linked project in sidebar order, with skill counts and sync health. */
export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({ queryKey: keys.projects.all, queryFn: () => api.projects.list() });
}

/**
 * Projects to offer in "Link a project". Read fresh each time the tab opens: it looks at other
 * apps' history, which changes without telling us.
 */
export function useProjectSuggestions(): UseQueryResult<ProjectSuggestion[]> {
  return useQuery({
    queryKey: keys.projects.suggestions,
    queryFn: () => api.projects.suggest(),
    staleTime: 0,
    gcTime: 0,
  });
}
