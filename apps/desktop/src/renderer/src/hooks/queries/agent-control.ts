import type { AgentControlStatus } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Whether the bundled skill that lets agents drive the command-line tool is installed. */
export function useAgentControlStatus(): UseQueryResult<AgentControlStatus> {
  return useQuery({
    queryKey: keys.system.agentControl,
    queryFn: () => api.system.agentControlStatus(),
  });
}
