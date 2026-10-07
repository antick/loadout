import type { AgentInfo, Skill } from "@loadout/shared";
import { useCallback } from "react";
import { useConfirmUndeploy, useDeploySkill, useUndeploySkill } from "@/hooks/mutations/deploy";

/** Deploy a skill to an agent, or take it away; settles once the backend answered or the user said no. */
export type AgentToggle = (
  skill: Skill,
  agent: Pick<AgentInfo, "key" | "displayName">,
  deployed: boolean,
) => Promise<void>;

/**
 * The one way a single badge, square or switch deploys or removes a skill: removing an edited copy
 * asks first. Made once by a list, so its rows hold no mutations of their own. Rejects when the
 * backend refuses; the mutation has toasted that already.
 */
export function useAgentToggle(): AgentToggle {
  const { mutateAsync: deploy } = useDeploySkill();
  const { mutateAsync: undeploy } = useUndeploySkill();
  const confirmUndeploy = useConfirmUndeploy();
  return useCallback(
    async (skill, agent, deployed) => {
      const pair = { skillId: skill.id, agentKey: agent.key };
      if (deployed) {
        await deploy(pair);
        return;
      }
      const deployment = skill.deployments.find((entry) => entry.agentKey === agent.key);
      const asked = await confirmUndeploy({
        skillId: skill.id,
        name: skill.name,
        agentKey: agent.key,
        agentName: agent.displayName,
        copy: deployment?.mode === "copy",
      });
      if (asked) await undeploy(pair);
    },
    [deploy, undeploy, confirmUndeploy],
  );
}
