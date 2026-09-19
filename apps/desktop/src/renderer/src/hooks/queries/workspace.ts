import type { LocalSkill, SkillDocument } from "@skillboard/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Everything inside one agent's global skills folder, managed or not, in the backend's order. */
export function useWorkspaceSkills(
  agentKey: string | null | undefined,
): UseQueryResult<LocalSkill[]> {
  return useQuery({
    queryKey: keys.workspace.list(agentKey ?? ""),
    queryFn: () => api.workspace.list(agentKey ?? ""),
    enabled: Boolean(agentKey),
  });
}

/** The main document of one skill folder in an agent's global folder. */
export function useWorkspaceDocument(
  agentKey: string | null | undefined,
  relativePath: string | null | undefined,
): UseQueryResult<SkillDocument> {
  return useQuery({
    queryKey: keys.workspace.document(agentKey ?? "", relativePath ?? ""),
    queryFn: () => api.workspace.document(agentKey ?? "", relativePath ?? ""),
    enabled: Boolean(agentKey) && Boolean(relativePath),
  });
}
