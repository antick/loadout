import type { BatchResult, Skill } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { reloadHintFor } from "@/lib/agent-reload";
import { api } from "@/lib/api";
import { runWithUndo, toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { toastWithUndo } from "@/lib/removed-undo";

/** One skill folder inside an agent's global skills folder. */
export interface LocalSkillRef {
  agentKey: string;
  relativePath: string;
  name: string;
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
    fn: (refs: LocalSkillRef[]) =>
      runWithUndo(
        refs,
        (ref) => ref.name,
        (ref) => api.workspace.deleteLocal(ref.agentKey, ref.relativePath),
        (count) => t("agents.toast.deletedMany", { count }),
      ),
    error: "agents.errors.delete",
  });
}

/**
 * Deploy library skills to one agent in one call and toast the agent page's own summary, folders
 * in the way listed with the failures. Rejects when nothing could be added, so the picker stays
 * open with the selection intact.
 */
export function useDeployToAgent(): (agentKey: string, skillIds: string[]) => Promise<void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { mutateAsync: apply } = useApplySkills();
  return async (agentKey, skillIds) => {
    const result = await apply({
      skillIds,
      agentKeys: [agentKey],
      action: "add",
      silent: true,
      skipConflicts: true,
    });
    const failed = [
      ...result.failed,
      ...result.conflicts.map((conflict) => ({ name: conflict.path, message: conflict.reason })),
    ];
    toastBatchOutcome(t("agents.toast.added", { count: result.added }), failed, {
      description: result.added > 0 ? reloadHintFor(queryClient, [agentKey]) : null,
    });
    if (result.added === 0 && failed.length > 0) throw new Error(t("agents.errors.addNone"));
  };
}
