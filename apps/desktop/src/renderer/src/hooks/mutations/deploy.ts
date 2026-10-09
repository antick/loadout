import type { ApplyResult, Deployment, UndeployResult } from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { reloadHintFor } from "@/lib/agent-reload";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCachedSkill, skillInSnapshot } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";
import { toastWithUndo } from "@/lib/removed-undo";
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
export function flipDeployment(
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

/**
 * Take back one flip the backend refused: only that skill × agent goes back to what it was, so a
 * badge clicked meanwhile keeps its own state. Then fetch the truth.
 */
export async function revertDeployment(
  queryClient: QueryClient,
  { skillId, agentKey }: DeployPairInput,
  snapshot: CacheSnapshot | undefined,
): Promise<void> {
  const before = skillInSnapshot(snapshot, skillId)?.deployments.find(
    (d) => d.agentKey === agentKey,
  );
  await patchCachedSkill(queryClient, skillId, (skill) => ({
    ...skill,
    deployments: [
      ...skill.deployments.filter((d) => d.agentKey !== agentKey),
      ...(before ? [before] : []),
    ],
  }));
  await queryClient.invalidateQueries({ queryKey: keys.skills.all });
  await queryClient.invalidateQueries({ queryKey: keys.skills.detail(skillId) });
}

/** Deploy one skill to one agent; the badge flips immediately and rolls back on failure. */
export function useDeploySkill(): UseMutationResult<void, unknown, DeployPairInput, CacheSnapshot> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ skillId, agentKey }: DeployPairInput) => api.deploy.deploy(skillId, agentKey),
    onMutate: (input) => flipDeployment(queryClient, input, true),
    error: "errors.deploy",
    onError: (_error, input, context) => revertDeployment(queryClient, input, context),
  });
}

/**
 * Remove one skill from one agent; the badge flips immediately and rolls back on failure. A copy
 * edited in the agent's folder goes to Recently removed: the toast says so and offers Undo.
 */
export function useUndeploySkill(): UseMutationResult<
  UndeployResult,
  unknown,
  DeployPairInput,
  CacheSnapshot
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, agentKey }: DeployPairInput) => api.deploy.undeploy(skillId, agentKey),
    onMutate: (input) => flipDeployment(queryClient, input, false),
    onSuccess: (result) => {
      if (result.removedIds.length > 0) {
        toastWithUndo(t("library.agents.editedCopyRemoved"), result.removedIds);
      }
    },
    error: "errors.undeploy",
    onError: (_error, input, context) => revertDeployment(queryClient, input, context),
  });
}

/** A library skill about to be taken out of an agent. */
export interface UndeployTarget {
  skillId: string;
  name: string;
  agentKey: string;
  agentName: string;
  /** The agent holds a copy, which may have been edited there; a link never is. */
  copy: boolean;
}

/**
 * Before removing a skill from an agent: when the copy there was edited, ask first, listing the
 * edited files. The one rule for every place that removes a skill from an agent. Resolves to false
 * when the answer was no.
 */
export function useConfirmUndeploy(): (target: UndeployTarget) => Promise<boolean> {
  const { t } = useTranslation();
  const confirm = useConfirm();
  return useCallback(
    async ({ skillId, name, agentKey, agentName, copy }) => {
      if (!copy) return true;
      let edited: string[];
      try {
        ({ editedCopies: edited } = await api.deploy.undeploy(skillId, agentKey, {
          dryRun: true,
        }));
      } catch {
        // Nothing is lost by going on: an edited copy still goes to Recently removed.
        return true;
      }
      if (edited.length === 0) return true;
      return confirm({
        title: t("agents.confirm.removeTitle", { name, agent: agentName }),
        description: t("agents.confirm.removeDescription"),
        items: edited,
        confirmLabel: t("agents.actions.removeShort"),
        destructive: true,
      });
    },
    [t, confirm],
  );
}

/**
 * Add or remove many skill × agent pairs in one call and toast the counts. Copies edited in an
 * agent's folder go to Recently removed: a toast says so and offers Undo, also when `silent`.
 */
export function useApplySkills(): UseMutationResult<ApplyResult, unknown, ApplySkillsInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillIds, agentKeys, action, skipConflicts }: ApplySkillsInput) =>
      api.deploy.apply(skillIds, agentKeys, action, skipConflicts ? { skipConflicts } : undefined),
    onSuccess: (result, { action, agentKeys, silent }) => {
      if (!silent) toastApplyResult(result, action, reloadHintFor(queryClient, agentKeys));
      if (result.removedIds.length > 0) {
        toastWithUndo(
          t("library.agents.editedCopiesRemoved", { count: result.removedIds.length }),
          result.removedIds,
        );
      }
    },
    error: "errors.apply",
  });
}
