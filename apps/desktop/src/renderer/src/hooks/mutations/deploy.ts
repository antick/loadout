import type { ApplyResult, Deployment, Skill } from "@loadout/shared";
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { reloadHintFor } from "@/lib/agent-reload";
import { toastApplyResult, toastError } from "@/lib/toast";
import { type CacheSnapshot, patchCachedSkill, restoreCached } from "@/lib/optimistic";

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
  return useMutation({
    mutationFn: ({ skillId, agentKey }: DeployPairInput) =>
      deployed ? api.deploy.deploy(skillId, agentKey) : api.deploy.undeploy(skillId, agentKey),
    onMutate: (input) => flipDeployment(queryClient, input, deployed),
    onError: (error, _input, context) => {
      restoreCached(queryClient, context);
      toastError(error, deployed ? "errors.deploy" : "errors.undeploy");
    },
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

export interface SetBlockedInput {
  skillId: string;
  agentKeys: string[];
  blocked: boolean;
}

/** Block or allow a skill for agents. Blocking also removes it from an agent it is deployed to. */
export function useSetBlocked(): UseMutationResult<Skill, unknown, SetBlockedInput> {
  return useMutation({
    mutationFn: ({ skillId, agentKeys, blocked }: SetBlockedInput) =>
      api.deploy.setBlocked(skillId, agentKeys, blocked),
    onError: (error) => toastError(error, "errors.block"),
  });
}

/** Add or remove many skill × agent pairs in one call and toast the counts. */
export function useApplySkills(): UseMutationResult<ApplyResult, unknown, ApplySkillsInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillIds, agentKeys, action, skipConflicts }: ApplySkillsInput) =>
      api.deploy.apply(skillIds, agentKeys, action, skipConflicts ? { skipConflicts } : undefined),
    onSuccess: (result, { action, agentKeys, silent }) => {
      if (!silent) toastApplyResult(result, action, reloadHintFor(queryClient, agentKeys));
    },
    onError: (error) => toastError(error, "errors.apply"),
  });
}
