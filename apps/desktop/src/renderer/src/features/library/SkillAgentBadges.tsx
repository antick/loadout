import type { AgentInfo, Skill } from "@loadout/shared";
import { type ReactNode, useCallback } from "react";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import { useDeploySkill, useUndeploySkill } from "@/hooks/mutations/deploy";
import { usePendingSet } from "@/hooks/use-pending-set";
import { useSkillAgentKeys } from "@/hooks/use-skill-agent-keys";

/** Deploy a skill to an agent, or take it away; settles once the backend answered. */
export type AgentToggle = (
  skillId: string,
  agentKey: string,
  deployed: boolean,
) => Promise<unknown>;

/**
 * One toggle for every badge of a list, made once by the page: each card then holds no
 * mutations of its own. The badge flips at once and rolls back on failure (see `deploy.ts`).
 */
export function useAgentToggle(): AgentToggle {
  const { mutateAsync: deploy } = useDeploySkill();
  const { mutateAsync: undeploy } = useUndeploySkill();
  return useCallback(
    (skillId, agentKey, deployed) => (deployed ? deploy : undeploy)({ skillId, agentKey }),
    [deploy, undeploy],
  );
}

/** `AgentBadgeRow` wired to a library skill: clicking a badge deploys or removes it right away. */
export function SkillAgentBadges({
  skill,
  agents,
  onToggle,
}: {
  skill: Skill;
  /** The agents skills can go to now. */
  agents: readonly AgentInfo[];
  onToggle: AgentToggle;
}): ReactNode {
  const { pending, mark } = usePendingSet();
  const { deployed, blocked } = useSkillAgentKeys(skill);

  return (
    <AgentBadgeRow
      agents={agents}
      deployedKeys={deployed}
      blockedKeys={blocked}
      pendingKeys={pending}
      onToggle={(agent, wantDeployed) => {
        mark(agent.key, true);
        // A promise per click, not per-call callbacks: TanStack Query only calls those for the
        // latest call, so a second badge clicked meanwhile would leave the first one spinning.
        // A failure is toasted by the mutation itself.
        onToggle(skill.id, agent.key, wantDeployed)
          .catch(() => undefined)
          .finally(() => mark(agent.key, false));
      }}
    />
  );
}
