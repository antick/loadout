import type { LocalSkill, ProjectTarget, SkillDocument } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every skill copy inside a project: one entry per skill per agent folder. */
export function useProjectSkills(
  projectId: string | null | undefined,
): UseQueryResult<LocalSkill[]> {
  return useQuery({
    queryKey: keys.projects.skills(projectId ?? ""),
    queryFn: () => api.projects.skills(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}

/** The agent folders a project can hold skills in. Agents sharing a folder are one target. */
export function useProjectTargets(
  projectId: string | null | undefined,
): UseQueryResult<ProjectTarget[]> {
  return useQuery({
    queryKey: keys.projects.targets(projectId ?? ""),
    queryFn: () => api.projects.targets(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}

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

/** Agent keys ticked the last time skills were added to this project. Empty when never saved. */
export function useLastExportAgents(
  projectId: string | null | undefined,
): UseQueryResult<string[]> {
  return useQuery({
    queryKey: keys.projects.lastExportAgents(projectId ?? ""),
    queryFn: () => api.projects.lastExportAgents(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}
