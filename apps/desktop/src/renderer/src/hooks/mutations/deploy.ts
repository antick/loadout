import type { ApplyResult, Deployment, Skill } from "@skillboard/shared";
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastApplyResult, toastError } from "@/lib/toast";

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
}

interface OptimisticContext {
  previous?: Skill[];
}

/** Marks a deployment row that only exists in the cache until the backend confirms it. */
export const PENDING_DEPLOYMENT_PREFIX = "pending:";

/** Flip one skill × agent badge in the cached skill list before the backend answers. */
async function flipDeployment(
  queryClient: QueryClient,
  { skillId, agentKey }: DeployPairInput,
  deployed: boolean,
): Promise<OptimisticContext> {
  await queryClient.cancelQueries({ queryKey: keys.skills.all });
  const previous = queryClient.getQueryData<Skill[]>(keys.skills.all);
  if (!previous) return {};
  queryClient.setQueryData<Skill[]>(
    keys.skills.all,
    previous.map((skill) => {
      if (skill.id !== skillId) return skill;
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
    }),
  );
  return { previous };
}

function usePairMutation(
  deployed: boolean,
): UseMutationResult<void, unknown, DeployPairInput, OptimisticContext> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, agentKey }: DeployPairInput) =>
      deployed ? api.deploy.deploy(skillId, agentKey) : api.deploy.undeploy(skillId, agentKey),
    onMutate: (input) => flipDeployment(queryClient, input, deployed),
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.skills.all, context.previous);
      toastError(error, deployed ? "errors.deploy" : "errors.undeploy");
    },
    onSettled: () => invalidateDeployments(queryClient),
  });
}

/** Refetch everything a deployment change shows up in: skills, agent workspaces, counts. */
export function invalidateDeployments(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: keys.skills.root });
  void queryClient.invalidateQueries({ queryKey: keys.workspace.root });
}

/** Deploy one skill to one agent; the badge flips immediately and rolls back on failure. */
export function useDeploySkill(): UseMutationResult<
  void,
  unknown,
  DeployPairInput,
  OptimisticContext
> {
  return usePairMutation(true);
}

/** Remove one skill from one agent; the badge flips immediately and rolls back on failure. */
export function useUndeploySkill(): UseMutationResult<
  void,
  unknown,
  DeployPairInput,
  OptimisticContext
> {
  return usePairMutation(false);
}

/** Add or remove many skill × agent pairs in one call and toast the counts. */
export function useApplySkills(): UseMutationResult<ApplyResult, unknown, ApplySkillsInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillIds, agentKeys, action }: ApplySkillsInput) =>
      api.deploy.apply(skillIds, agentKeys, action),
    onSuccess: (result, { action, silent }) => {
      if (!silent) toastApplyResult(result, action);
    },
    onError: (error) => toastError(error, "errors.apply"),
    onSettled: () => invalidateDeployments(queryClient),
  });
}
