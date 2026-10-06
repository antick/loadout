import type { AgentInfo, Skill } from "@loadout/shared";
import type { ReactNode } from "react";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import type { AgentToggle } from "@/hooks/mutations/deploy";
import { usePendingSet } from "@/hooks/use-pending-set";
import { useSkillAgentKeys } from "@/hooks/use-skill-agent-keys";

/**
 * `AgentBadgeRow` wired to a library skill: clicking a badge deploys or removes it right away
 * (asking first before an edited copy goes).
 */
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
        onToggle(skill, agent, wantDeployed)
          .catch(() => undefined)
          .finally(() => mark(agent.key, false));
      }}
    />
  );
}
