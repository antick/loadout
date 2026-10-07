import type { Skill } from "@loadout/shared";
import { useMemo } from "react";

export interface SkillAgentKeys {
  /** Agents holding a deployment of the skill. */
  deployed: ReadonlySet<string>;
  /** Agents the skill is kept away from. */
  blocked: ReadonlySet<string>;
}

/** The agents a skill is deployed to and blocked from, as sets that only change when they do. */
export function useSkillAgentKeys(
  skill: Pick<Skill, "deployments" | "blockedAgents">,
): SkillAgentKeys {
  const deployed = useMemo(
    () => new Set(skill.deployments.map((deployment) => deployment.agentKey)),
    [skill.deployments],
  );
  const blocked = useMemo(() => new Set(skill.blockedAgents), [skill.blockedAgents]);
  return { deployed, blocked };
}
