import type { BatchResult, Skill } from "@loadout/shared";
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { runSequentially, toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

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

/** An agent folder changed: refresh its list, the counts, and the library's deployment badges. */
function invalidateWorkspace(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: keys.workspace.root });
  void queryClient.invalidateQueries({ queryKey: keys.skills.root });
}

/** Refetch one agent's folder and the per-agent counts (the Refresh button). */
export function useRefreshWorkspace(): (agentKey: string) => Promise<void> {
  const queryClient = useQueryClient();
  return async (agentKey) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.workspace.list(agentKey) }),
      queryClient.invalidateQueries({ queryKey: keys.workspace.counts }),
    ]);
  };
}

/** Copy a local skill into the library (new, or over its match); the app manages it afterwards. */
export function useUploadLocalSkill(): UseMutationResult<Skill, unknown, LocalSkillRef> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ agentKey, relativePath }: LocalSkillRef) =>
      api.workspace.upload(agentKey, relativePath),
    onSuccess: (skill) =>
      toastSuccess(t("agents.toast.uploaded", { name: skill.name }), t("agents.toast.nowManaged")),
    onError: (error) => toastError(error, "agents.errors.upload"),
    onSettled: () => invalidateWorkspace(queryClient),
  });
}

/** Replace the local folder with the library version. */
export function usePullLocalSkill(): UseMutationResult<void, unknown, LocalSkillRef> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ agentKey, relativePath }: LocalSkillRef) =>
      api.workspace.pull(agentKey, relativePath),
    onSuccess: (_result, { name }) => toastSuccess(t("agents.toast.pulled", { name })),
    onError: (error) => toastError(error, "agents.errors.pull"),
    onSettled: () => invalidateWorkspace(queryClient),
  });
}

/** Delete a skill folder the app does not manage. There is no library copy to fall back on. */
export function useDeleteLocalSkill(): UseMutationResult<void, unknown, LocalSkillRef> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ agentKey, relativePath }: LocalSkillRef) =>
      api.workspace.deleteLocal(agentKey, relativePath),
    onSuccess: (_result, { name }) => toastSuccess(t("agents.toast.deleted", { name })),
    onError: (error) => toastError(error, "agents.errors.delete"),
    onSettled: () => invalidateWorkspace(queryClient),
  });
}

/** Delete several unmanaged skill folders, one after the other, and toast the counts. */
export function useDeleteLocalSkills(): UseMutationResult<BatchResult, unknown, LocalSkillRef[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (refs: LocalSkillRef[]) =>
      runSequentially(
        refs,
        (ref) => ref.name,
        (ref) => api.workspace.deleteLocal(ref.agentKey, ref.relativePath),
      ),
    onSuccess: (result) =>
      toastBatchOutcome(t("agents.toast.deletedMany", { count: result.succeeded }), result.failed),
    onError: (error) => toastError(error, "agents.errors.delete"),
    onSettled: () => invalidateWorkspace(queryClient),
  });
}

/** Take a managed skill out of one agent. The library copy stays. */
export function useRemoveFromAgent(): UseMutationResult<void, unknown, ManagedSkillRef> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ skillId, agentKey }: ManagedSkillRef) => api.deploy.undeploy(skillId, agentKey),
    onSuccess: (_result, { name }) => toastSuccess(t("agents.toast.removed", { name })),
    onError: (error) => toastError(error, "errors.undeploy"),
    onSettled: () => invalidateWorkspace(queryClient),
  });
}

/**
 * Deploy library skills to one agent, one after the other, and toast one summary. Rejects when
 * nothing could be added, so the picker stays open with the selection intact.
 */
export function useDeployToAgent(): UseMutationResult<BatchResult, unknown, DeployToAgentInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ agentKey, skills }: DeployToAgentInput) => {
      const result = await runSequentially(
        skills,
        (skill) => skill.name,
        (skill) => api.deploy.deploy(skill.id, agentKey),
      );
      toastBatchOutcome(t("agents.toast.added", { count: result.succeeded }), result.failed);
      if (result.succeeded === 0 && result.failed.length > 0) {
        throw new Error(t("agents.errors.addNone"));
      }
      return result;
    },
    onSettled: () => invalidateWorkspace(queryClient),
  });
}
