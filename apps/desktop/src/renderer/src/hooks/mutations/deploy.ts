import type { ApplyResult, Deployment } from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { reloadHintFor } from "@/lib/agent-reload";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCachedSkill, restoreCached } from "@/lib/optimistic";
import { toastApplyResult } from "@/lib/toast";

export interface DeployPairInput {
  skillId: string;
  agentKey: string;
}

export interface ApplySkillsInput {
  skillIds: string[];
  agentKeys: string[];
  action: "add" | "remove";
  /** Skip the summary toast when the caller reports the outcome itself. */
  silent?: boolean;
  /** Add what can be added and report the folders in the way, instead of adding nothing. */
  skipConflicts?: boolean;
}

/** Marks a deployment row that only exists in the cache until the backend confirms it. */
export const PENDING_DEPLOYMENT_PREFIX = "pending:";

/** Flip one skill × agent badge wherever the skill is cached, before the backend answers. */
function flipDeployment(
  queryClient: QueryClient,
  { skillId, agentKey }: DeployPairInput,
  deployed: boolean,
): Promise<CacheSnapshot> {
  return patchCachedSkill(queryClient, skillId, (skill) => {
    const others = skill.deployments.filter((d) => d.agentKey !== agentKey);
    if (!deployed) return { ...skill, deployments: others };
    const pending: Deployment = {
      id: `${PENDING_DEPLOYMENT_PREFIX}${skillId}:${agentKey}`,
      skillId,
      agentKey,
      targetPath: "",
      mode: "symlink",
      syncedAt: null,
    };
    return { ...skill, deployments: [...others, pending] };
  });
}

function usePairMutation(
  deployed: boolean,
): UseMutationResult<void, unknown, DeployPairInput, CacheSnapshot> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ skillId, agentKey }: DeployPairInput) =>
      deployed ? api.deploy.deploy(skillId, agentKey) : api.deploy.undeploy(skillId, agentKey),
    onMutate: (input) => flipDeployment(queryClient, input, deployed),
    error: deployed ? "errors.deploy" : "errors.undeploy",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}

/** Deploy one skill to one agent; the badge flips immediately and rolls back on failure. */
export function useDeploySkill(): UseMutationResult<void, unknown, DeployPairInput, CacheSnapshot> {
  return usePairMutation(true);
}

/** Remove one skill from one agent; the badge flips immediately and rolls back on failure. */
export function useUndeploySkill(): UseMutationResult<
  void,
  unknown,
  DeployPairInput,
  CacheSnapshot
> {
  return usePairMutation(false);
}

/** Add or remove many skill × agent pairs in one call and toast the counts. */
export function useApplySkills(): UseMutationResult<ApplyResult, unknown, ApplySkillsInput> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ skillIds, agentKeys, action, skipConflicts }: ApplySkillsInput) =>
      api.deploy.apply(skillIds, agentKeys, action, skipConflicts ? { skipConflicts } : undefined),
    onSuccess: (result, { action, agentKeys, silent }) => {
      if (!silent) toastApplyResult(result, action, reloadHintFor(queryClient, agentKeys));
    },
    error: "errors.apply",
  });
}
