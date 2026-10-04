import type { AgentFolderSummary, RemovedFolder, StorageReport } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every area Loadout keeps on disk, with its size. Measured fresh each time it is shown. */
export function useStorageReport(): UseQueryResult<StorageReport> {
  return useQuery({
    queryKey: keys.storage.report,
    queryFn: () => api.storage.report(),
    staleTime: 0,
  });
}

/** Skill folders taken out of agent and project folders, newest first. */
export function useRemovedFolders(): UseQueryResult<RemovedFolder[]> {
  return useQuery({
    queryKey: keys.storage.removed,
    queryFn: () => api.storage.removed(),
    staleTime: 0,
  });
}

/** Links and copies in agent folders, counted fresh whenever the removal choice opens. */
export function useAgentFolders(enabled: boolean): UseQueryResult<AgentFolderSummary> {
  return useQuery({
    queryKey: keys.storage.agentFolders,
    queryFn: () => api.storage.agentFolders(),
    staleTime: 0,
    enabled,
  });
}
