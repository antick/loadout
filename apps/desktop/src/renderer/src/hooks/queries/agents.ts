import { type AgentCategory, type AgentInfo, isAgentAvailable } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { REFETCH_ON_FOCUS } from "@/lib/query-client";
import { keys } from "@/lib/query-keys";

/** Every known agent, in the user's order. */
export function useAgents(): UseQueryResult<AgentInfo[]> {
  return useQuery({
    queryKey: keys.agents.all,
    queryFn: () => api.agents.list(),
    ...REFETCH_ON_FOCUS,
  });
}

/** Every agent's display name by its key, for labelling deployments and shared folders. */
export function useAgentNames(): ReadonlyMap<string, string> {
  const agents = useAgents();
  return useMemo(
    () => new Map((agents.data ?? []).map((agent) => [agent.key, agent.displayName])),
    [agents.data],
  );
}

/** Installed and enabled agents, optionally limited to one category. */
export function useAvailableAgents(category?: AgentCategory): UseQueryResult<AgentInfo[]> {
  const select = useCallback(
    (agents: AgentInfo[]) =>
      agents.filter(
        (agent) =>
          isAgentAvailable(agent) && (category === undefined || agent.category === category),
      ),
    [category],
  );
  return useQuery({
    queryKey: keys.agents.all,
    queryFn: () => api.agents.list(),
    select,
    ...REFETCH_ON_FOCUS,
  });
}

/** Number of skill folders in each available agent's global folder, keyed by agent key. */
export function useWorkspaceCounts(
  agentKeys: readonly string[],
): UseQueryResult<Record<string, number>> {
  return useQuery({
    queryKey: [...keys.workspace.counts, ...agentKeys],
    queryFn: () => api.workspace.counts([...agentKeys]),
    enabled: agentKeys.length > 0,
  });
}
