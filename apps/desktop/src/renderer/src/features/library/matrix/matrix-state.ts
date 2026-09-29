import type { Skill } from "@loadout/shared";
import { PENDING_DEPLOYMENT_PREFIX } from "@/hooks/mutations/deploy";

/**
 * What one cell of the matrix shows. `pending`: switched on, waiting for the backend to confirm.
 * `blocked`: not deployed, and the skill may never be. A deployment wins over a block, since the
 * file is really there (a block set on another device does not remove it).
 */
export type MatrixCellState = "deployed" | "pending" | "blocked" | "empty";

export function matrixCellState(skill: Skill, agentKey: string): MatrixCellState {
  const deployment = skill.deployments.find((entry) => entry.agentKey === agentKey);
  if (deployment) {
    return deployment.id.startsWith(PENDING_DEPLOYMENT_PREFIX) ? "pending" : "deployed";
  }
  return skill.blockedAgents.includes(agentKey) ? "blocked" : "empty";
}

/** How many of the listed skills an agent has; blocked pairs do not count against the total. */
export function agentColumnCoverage(
  skills: readonly Skill[],
  agentKey: string,
): { deployed: number; total: number } {
  let deployed = 0;
  let total = 0;
  for (const skill of skills) {
    const state = matrixCellState(skill, agentKey);
    if (state === "blocked") continue;
    total += 1;
    if (state !== "empty") deployed += 1;
  }
  return { deployed, total };
}
