import type { ProjectSuggestion, ProjectSuggestions, SkillDocument } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** The main document of one copy of a project skill. */
export function useProjectDocument(
  projectId: string | null | undefined,
  relativePath: string | null | undefined,
  agentKey: string | null | undefined,
): UseQueryResult<SkillDocument> {
  return useQuery({
    queryKey: keys.projects.document(projectId ?? "", relativePath ?? "", agentKey ?? ""),
    queryFn: () => api.projects.document(projectId ?? "", relativePath ?? "", agentKey ?? ""),
    enabled: Boolean(projectId) && Boolean(relativePath) && Boolean(agentKey),
  });
}

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
