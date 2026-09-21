import type { AgentCategory, AgentInfo } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** An agent skills can be deployed to right now: found on this machine and not switched off. */
export function isAgentAvailable(agent: AgentInfo): boolean {
  return agent.installed && agent.enabled;
}

/** Every known agent, in the user's order. */
export function useAgents(): UseQueryResult<AgentInfo[]> {
  return useQuery({ queryKey: keys.agents.all, queryFn: () => api.agents.list() });
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
  return useQuery({ queryKey: keys.agents.all, queryFn: () => api.agents.list(), select });
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
