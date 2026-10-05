import type { Skill } from "@loadout/shared";

/** The agent does not have the skill yet, and the skill is not blocked for it. */
export function canReceive(skill: Skill, agentKey: string): boolean {
  return (
    !skill.deployments.some((deployment) => deployment.agentKey === agentKey) &&
    !skill.blockedAgents.includes(agentKey)
  );
}

/** How many of the skills the agent may still get. */
export function missingCount(skills: readonly Skill[], agentKey: string): number {
  return skills.filter((skill) => canReceive(skill, agentKey)).length;
}

export interface DeployPlan {
  /** Chosen agents that may get at least one of the skills. */
  agentKeys: string[];
  /** Skills at least one of those agents may get. */
  skillIds: string[];
  /** Skill and agent pairs the deploy adds. */
  pairs: number;
}

/** What deploying the skills to the chosen agents adds; pairs in place or blocked are left out. */
export function deployPlan(skills: readonly Skill[], chosen: Iterable<string>): DeployPlan {
  let pairs = 0;
  const agentKeys: string[] = [];
  for (const key of chosen) {
    const missing = missingCount(skills, key);
    if (missing === 0) continue;
    pairs += missing;
    agentKeys.push(key);
  }
  const skillIds = skills
    .filter((skill) => agentKeys.some((key) => canReceive(skill, key)))
    .map((skill) => skill.id);
  return { agentKeys, skillIds, pairs };
}
