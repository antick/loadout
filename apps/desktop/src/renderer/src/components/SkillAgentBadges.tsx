import type { AgentInfo, Skill } from "@skillboard/shared";
import { type ReactNode, useMemo, useState } from "react";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import { useDeploySkill, useUndeploySkill } from "@/hooks/mutations/deploy";
import { useAvailableAgents } from "@/hooks/queries/agents";

export interface SkillAgentBadgesProps {
  skill: Skill;
  /** Limit to these agents; defaults to every available agent. */
  agents?: readonly AgentInfo[];
  className?: string;
}

/** `AgentBadgeRow` wired to a library skill: clicking a badge deploys or removes it right away. */
export function SkillAgentBadges({ skill, agents, className }: SkillAgentBadgesProps): ReactNode {
  const available = useAvailableAgents();
  const deploy = useDeploySkill();
  const undeploy = useUndeploySkill();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const deployedKeys = useMemo(
    () => new Set(skill.deployments.map((d) => d.agentKey)),
    [skill.deployments],
  );

  const setAgentPending = (agentKey: string, on: boolean): void =>
    setPending((previous) => {
      const next = new Set(previous);
      if (on) next.add(agentKey);
      else next.delete(agentKey);
      return next;
    });

  return (
    <AgentBadgeRow
      className={className}
      agents={agents ?? available.data ?? []}
      deployedKeys={deployedKeys}
      pendingKeys={pending}
      onToggle={(agent, wantDeployed) => {
        setAgentPending(agent.key, true);
        (wantDeployed ? deploy : undeploy).mutate(
          { skillId: skill.id, agentKey: agent.key },
          { onSettled: () => setAgentPending(agent.key, false) },
        );
      }}
    />
  );
}
