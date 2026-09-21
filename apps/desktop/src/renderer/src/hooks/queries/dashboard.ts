import type { ActivityEntry, AgentControlStatus } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** The newest entries of the activity log. */
export function useActivity(limit: number): UseQueryResult<ActivityEntry[]> {
  return useQuery({
    queryKey: keys.system.activity(limit),
    queryFn: () => api.system.activity(limit),
  });
}

/** Whether the bundled skill that lets agents drive the command-line tool is installed. */
export function useAgentControlStatus(): UseQueryResult<AgentControlStatus> {
  return useQuery({
    queryKey: keys.system.agentControl,
    queryFn: () => api.system.agentControlStatus(),
  });
}
