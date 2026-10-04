import type { BatchResult, Skill } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { reloadHintFor } from "@/lib/agent-reload";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { runSequentially, toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { toastWithUndo, undoAction } from "@/lib/removed-undo";

/** One skill folder inside an agent's global skills folder. */
export interface LocalSkillRef {
  agentKey: string;
  relativePath: string;
  name: string;
}

export interface ManagedSkillRef {
  agentKey: string;
  skillId: string;
  name: string;
}

export interface DeployToAgentInput {
  agentKey: string;
  skills: readonly { id: string; name: string }[];
}

/** Refetch one agent's folder and the per-agent counts (the Refresh button). */
export function useRefreshWorkspace(): (agentKey: string) => Promise<void> {
  const queryClient = useQueryClient();
  return async (agentKey) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.workspace.list(agentKey) }),
      queryClient.invalidateQueries({ queryKey: keys.workspace.broken(agentKey) }),
      queryClient.invalidateQueries({ queryKey: keys.workspace.plugins(agentKey) }),
      queryClient.invalidateQueries({ queryKey: keys.workspace.listingOf(agentKey) }),
      queryClient.invalidateQueries({ queryKey: keys.workspace.counts }),
    ]);
  };
}

/** Copy a local skill into the library (new, or over its match); the app manages it afterwards. */
export function useUploadLocalSkill(): UseMutationResult<Skill, unknown, LocalSkillRef> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ agentKey, relativePath }: LocalSkillRef) => api.workspace.upload(agentKey, relativePath),
    success: (skill) => ({
      message: t("agents.toast.uploaded", { name: skill.name }),
      description: t("agents.toast.nowManaged"),
    }),
    error: "agents.errors.upload",
  });
}

/** Replace the local folder with the library version; its own changes go to Recently removed. */
export function usePullLocalSkill(): UseMutationResult<string[], unknown, LocalSkillRef> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ agentKey, relativePath }: LocalSkillRef) => api.workspace.pull(agentKey, relativePath),
    onSuccess: (removedIds, { name }) =>
      toastWithUndo(t("agents.toast.pulled", { name }), removedIds),
    error: "agents.errors.pull",
  });
}

/** Delete a skill folder the app does not manage. It goes to Recently removed. */
export function useDeleteLocalSkill(): UseMutationResult<string[], unknown, LocalSkillRef> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ agentKey, relativePath }: LocalSkillRef) =>
      api.workspace.deleteLocal(agentKey, relativePath),
    onSuccess: (removedIds, { name }) =>
      toastWithUndo(t("agents.toast.deleted", { name }), removedIds),
    error: "agents.errors.delete",
  });
}

/** Delete a folder the agent ignores (no SKILL.md, or a link to nothing). */
export function useDeleteBrokenFolder(): UseMutationResult<string[], unknown, LocalSkillRef> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ agentKey, relativePath }: LocalSkillRef) =>
      api.workspace.deleteBroken(agentKey, relativePath),
    onSuccess: (removedIds, { name }) =>
      toastWithUndo(t("agents.toast.deleted", { name }), removedIds),
    error: "agents.errors.deleteBroken",
  });
}

/** Delete several unmanaged skill folders, one after the other, and toast the counts. */
export function useDeleteLocalSkills(): UseMutationResult<BatchResult, unknown, LocalSkillRef[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (refs: LocalSkillRef[]) => {
      const removedIds: string[] = [];
      const result = await runSequentially(
        refs,
        (ref) => ref.name,
        async (ref) => {
          removedIds.push(...(await api.workspace.deleteLocal(ref.agentKey, ref.relativePath)));
        },
      );
      toastBatchOutcome(t("agents.toast.deletedMany", { count: result.succeeded }), result.failed, {
        action: undoAction(removedIds),
      });
      return result;
    },
    error: "agents.errors.delete",
  });
}

/** Take a managed skill out of one agent. The library copy stays. */
export function useRemoveFromAgent(): UseMutationResult<void, unknown, ManagedSkillRef> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, agentKey }: ManagedSkillRef) => api.deploy.undeploy(skillId, agentKey),
    success: (_result, { name }) => t("agents.toast.removed", { name }),
    error: "errors.undeploy",
  });
}

/**
 * Deploy library skills to one agent, one after the other, and toast one summary. Rejects when
 * nothing could be added, so the picker stays open with the selection intact.
 */
export function useDeployToAgent(): UseMutationResult<BatchResult, unknown, DeployToAgentInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ agentKey, skills }: DeployToAgentInput) => {
      const result = await runSequentially(
        skills,
        (skill) => skill.name,
        (skill) => api.deploy.deploy(skill.id, agentKey),
      );
      toastBatchOutcome(t("agents.toast.added", { count: result.succeeded }), result.failed, {
        description: result.succeeded > 0 ? reloadHintFor(queryClient, [agentKey]) : null,
      });
      if (result.succeeded === 0 && result.failed.length > 0) {
        throw new Error(t("agents.errors.addNone"));
      }
      return result;
    },
    error: false,
  });
}
