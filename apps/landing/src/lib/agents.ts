import { AGENT_PRIORITY_ORDER, BUILT_IN_AGENTS, type AgentDefinition } from "@loadout/shared";

/** The app's own agent list, so the page never disagrees with what the app supports. */
export const AGENT_COUNT = BUILT_IN_AGENTS.length;

const rank = (key: string): number => {
  const index = AGENT_PRIORITY_ORDER.indexOf(key);
  return index === -1 ? AGENT_PRIORITY_ORDER.length : index;
};

/** Every agent, the best known first, then by name. */
export function agentsInOrder(): AgentDefinition[] {
  return [...BUILT_IN_AGENTS].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.displayName.localeCompare(b.displayName),
  );
}

const FEATURED_AGENT_COUNT = 5;
export const FEATURED_AGENTS = agentsInOrder().slice(0, FEATURED_AGENT_COUNT);
