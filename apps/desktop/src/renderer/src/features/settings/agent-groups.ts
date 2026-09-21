import type { AgentInfo } from "@loadout/shared";
import type { AgentGroupId } from "./constants";

export function agentGroupOf(agent: AgentInfo): AgentGroupId {
  if (agent.isCustom) return "custom";
  return agent.installed ? "detected" : "other";
}

/** Agents split into the three groups of the settings list, each keeping the user's order. */
export function groupAgents(agents: readonly AgentInfo[]): Record<AgentGroupId, AgentInfo[]> {
  const groups: Record<AgentGroupId, AgentInfo[]> = { detected: [], custom: [], other: [] };
  for (const agent of agents) groups[agentGroupOf(agent)].push(agent);
  return groups;
}

/**
 * The full key list after one group was reordered. The group's members keep the slots they had in
 * the overall order and swap places among themselves, so other groups are left exactly as they were.
 */
export function mergeGroupOrder(
  allKeys: readonly string[],
  reorderedGroup: readonly string[],
): string[] {
  const members = new Set(reorderedGroup);
  let next = 0;
  return allKeys.map((key) => (members.has(key) ? (reorderedGroup[next++] ?? key) : key));
}
