import type { Skill } from "@loadout/shared";
import type { ReactNode } from "react";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import { useDeploySkill, useUndeploySkill } from "@/hooks/mutations/deploy";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { usePendingSet } from "@/hooks/use-pending-set";
import { useSkillAgentKeys } from "@/hooks/use-skill-agent-keys";

/** `AgentBadgeRow` wired to a library skill: clicking a badge deploys or removes it right away. */
export function SkillAgentBadges({ skill }: { skill: Skill }): ReactNode {
  const available = useAvailableAgents();
  const deploy = useDeploySkill();
  const undeploy = useUndeploySkill();
  const { pending, mark } = usePendingSet();
  const { deployed, blocked } = useSkillAgentKeys(skill);

  return (
    <AgentBadgeRow
      agents={available.data ?? []}
      deployedKeys={deployed}
      blockedKeys={blocked}
      pendingKeys={pending}
      onToggle={(agent, wantDeployed) => {
        mark(agent.key, true);
        // `mutateAsync`, not per-call callbacks: TanStack Query only calls those for the latest
        // call, so a second badge clicked meanwhile would leave the first one spinning for good.
        // A failure is toasted by the mutation itself.
        (wantDeployed ? deploy : undeploy)
          .mutateAsync({ skillId: skill.id, agentKey: agent.key })
          .catch(() => undefined)
          .finally(() => mark(agent.key, false));
      }}
    />
  );
}
