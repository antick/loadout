import type {
  BatchResult,
  PushToLibraryOptions,
  PushToLibraryResult,
  SkillVersion,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { reloadHintFor } from "@/lib/agent-reload";
import { api } from "@/lib/api";
import { describeFailures, runSequentially, toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { toastWithUndo, undoAction } from "@/lib/removed-undo";
import { FAILURE_LIST_CLASS } from "@/lib/toast";
import { toastSuccess } from "@/lib/toast";

/** One logical skill of a project: every per-agent copy at this relative path. */
export interface ProjectSkillRef {
  projectId: string;
  relativePath: string;
  name: string;
}

export interface ExportSkillInput {
  projectId: string;
  skillId: string;
  name: string;
  /** Target keys to write to. */
  agentKeys: string[];
  /** Shown in the toast, e.g. the target's display name. */
  targetName?: string;
}

export interface DeleteProjectSkillInput extends ProjectSkillRef {
  /** Only this target's copy; omit to delete every copy. */
  agentKey?: string;
  targetName?: string;
}

export interface PullFromLibraryInput extends ProjectSkillRef {
  /** The project copy is newer and the user chose to throw its changes away. */
  restore?: boolean;
}

export interface SetEnabledInput extends ProjectSkillRef {
  enabled: boolean;
}

/** Refetch one project's skills and targets, plus the project list (the Refresh button). */
export function useRefreshProject(): (projectId: string) => Promise<void> {
  const queryClient = useQueryClient();
  return async (projectId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.projects.skills(projectId) }),
      queryClient.invalidateQueries({ queryKey: keys.projects.targets(projectId) }),
      queryClient.invalidateQueries({ queryKey: keys.projects.all }),
    ]);
  };
}

/** Copy one library skill into a project for the given targets. */
export function useExportSkill(): UseMutationResult<void, unknown, ExportSkillInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, projectId, agentKeys }: ExportSkillInput) =>
      api.projects.exportSkill(skillId, projectId, agentKeys),
    success: (_result, { name, targetName }) =>
      targetName
        ? t("projectPage.toast.exportedTo", { name, target: targetName })
        : t("projectPage.toast.exported", { name }),
    error: "projectPage.errors.export",
  });
}

/** Delete one copy of a project skill, or every copy when no target is given. */
export function useDeleteProjectSkill(): UseMutationResult<
  string[],
  unknown,
  DeleteProjectSkillInput
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ projectId, relativePath, agentKey }: DeleteProjectSkillInput) =>
      api.projects.deleteSkill(projectId, relativePath, agentKey),
    onSuccess: (removedIds, { name, targetName }) =>
      toastWithUndo(
        targetName
          ? t("projectPage.toast.removedFrom", { name, target: targetName })
          : t("projectPage.toast.deleted", { name }),
        removedIds,
      ),
    error: "projectPage.errors.delete",
  });
}

export interface PushToLibraryInput extends ProjectSkillRef {
  /** Which version to add, and whether the other copies follow; see `PushToLibraryOptions`. */
  options?: PushToLibraryOptions;
}

/**
 * Push a project skill to the library. When its copies disagree nothing is written and
 * `onChooseVersion` gets the versions, so the user can pick one.
 */
export function usePushToLibrary(
  onChooseVersion?: (ref: ProjectSkillRef, versions: SkillVersion[]) => void,
): UseMutationResult<PushToLibraryResult, unknown, PushToLibraryInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ projectId, relativePath, options }: PushToLibraryInput) =>
      api.projects.pushToLibrary(projectId, relativePath, options),
    onSuccess: (result, { projectId, relativePath, name }) => {
      if (result.conflictingVariants > 0) {
        if (onChooseVersion) onChooseVersion({ projectId, relativePath, name }, result.versions);
        else {
          toast.warning(t("projectPage.toast.pushConflictTitle", { name }), {
            description: t("projectPage.toast.pushConflict"),
          });
        }
      } else if (result.realignFailed > 0) {
        toast.warning(t("projectPage.toast.pushed", { name }), {
          description: t("projectPage.toast.realignFailed", { count: result.realignFailed }),
          action: undoAction(result.removedIds),
        });
      } else toastWithUndo(t("projectPage.toast.pushed", { name }), result.removedIds);
    },
    error: "projectPage.errors.push",
  });
}

/** Replace every copy of a project skill with the library version. */
export function usePullFromLibrary(): UseMutationResult<string[], unknown, PullFromLibraryInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ projectId, relativePath }: PullFromLibraryInput) =>
      api.projects.pullFromLibrary(projectId, relativePath),
    onSuccess: (removedIds, { name, restore }) =>
      toastWithUndo(
        t(restore ? "projectPage.toast.restored" : "projectPage.toast.pulled", { name }),
        removedIds,
      ),
    error: "projectPage.errors.pull",
  });
}

/** Switch every copy of a project skill on or off. */
export function useSetProjectSkillEnabled(): UseMutationResult<void, unknown, SetEnabledInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ projectId, relativePath, enabled }: SetEnabledInput) =>
      api.projects.setSkillEnabled(projectId, relativePath, enabled),
    success: (_result, { name, enabled }) =>
      t(enabled ? "projectPage.toast.enabled" : "projectPage.toast.disabled", { name }),
    error: "projectPage.errors.toggle",
  });
}

/** Remember which agents to tick the next time skills are added to this project. */
export function useSetLastExportAgents(): UseMutationResult<
  void,
  unknown,
  { projectId: string; agentKeys: string[]; silent?: boolean }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ projectId, agentKeys }) => api.projects.setLastExportAgents(projectId, agentKeys),
    onSuccess: (_result, { silent }) => {
      if (!silent) toastSuccess(t("projectPage.toast.defaultsSaved"));
    },
    error: "projectPage.errors.saveDefaults",
    invalidate: ({ projectId }) => [keys.projects.lastExportAgents(projectId)],
  });
}

// ── Batches ──

export interface ExportJob {
  skillId: string;
  name: string;
  agentKeys: string[];
}

export interface DeleteVariantJob {
  relativePath: string;
  agentKey: string;
  name: string;
}

export interface BatchPushResult {
  updated: number;
  /** Names left alone because several copies may each hold content of their own. */
  conflicting: string[];
  /** Names pushed, but not every other copy could be brought back in line. */
  realignFailed: string[];
  failed: BatchResult["failed"];
  /** Other versions the realign replaced, kept in Recently removed. */
  removedIds: string[];
}

/**
 * Export many skill × target jobs one after the other and toast one summary. Rejects when nothing
 * could be added, so a picker stays open with the selection intact.
 */
export function useExportSkills(): UseMutationResult<
  BatchResult,
  unknown,
  { projectId: string; jobs: readonly ExportJob[] }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ projectId, jobs }) => {
      const result = await runSequentially(
        jobs,
        (job) => job.name,
        (job) => api.projects.exportSkill(job.skillId, projectId, job.agentKeys),
      );
      const agentKeys = jobs.flatMap((job) => job.agentKeys);
      toastBatchOutcome(
        t("projectPage.toast.exportedMany", { count: result.succeeded }),
        result.failed,
        { description: result.succeeded > 0 ? reloadHintFor(queryClient, agentKeys) : null },
      );
      if (result.succeeded === 0 && result.failed.length > 0) {
        throw new Error(t("projectPage.errors.export"));
      }
      return result;
    },
    error: false,
  });
}

/** Delete many single copies (skill × target), e.g. when a preset is taken out of a project. */
export function useDeleteVariants(): UseMutationResult<
  BatchResult,
  unknown,
  { projectId: string; jobs: readonly DeleteVariantJob[] }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ projectId, jobs }) => {
      const removedIds: string[] = [];
      const result = await runSequentially(
        jobs,
        (job) => job.name,
        async (job) => {
          removedIds.push(
            ...(await api.projects.deleteSkill(projectId, job.relativePath, job.agentKey)),
          );
        },
      );
      toastBatchOutcome(
        t("projectPage.toast.removedCopies", { count: result.succeeded }),
        result.failed,
        { action: undoAction(removedIds) },
      );
      return result;
    },
    error: "projectPage.errors.delete",
  });
}

/** Delete every copy of several project skills. */
export function useDeleteProjectSkills(): UseMutationResult<
  BatchResult,
  unknown,
  ProjectSkillRef[]
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (refs: ProjectSkillRef[]) => {
      const removedIds: string[] = [];
      const result = await runSequentially(
        refs,
        (ref) => ref.name,
        async (ref) => {
          removedIds.push(...(await api.projects.deleteSkill(ref.projectId, ref.relativePath)));
        },
      );
      toastBatchOutcome(
        t("projectPage.toast.deletedMany", { count: result.succeeded }),
        result.failed,
        { action: undoAction(removedIds) },
      );
      return result;
    },
    error: "projectPage.errors.delete",
  });
}

/** Switch several project skills on or off. */
export function useSetProjectSkillsEnabled(): UseMutationResult<
  BatchResult,
  unknown,
  { refs: ProjectSkillRef[]; enabled: boolean }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ refs, enabled }) =>
      runSequentially(
        refs,
        (ref) => ref.name,
        (ref) => api.projects.setSkillEnabled(ref.projectId, ref.relativePath, enabled),
      ),
    onSuccess: (result, { enabled }) =>
      toastBatchOutcome(
        t(enabled ? "projectPage.toast.enabledMany" : "projectPage.toast.disabledMany", {
          count: result.succeeded,
        }),
        result.failed,
      ),
    error: "projectPage.errors.toggle",
  });
}

/** Replace several project skills with their library versions. */
export function usePullManyFromLibrary(): UseMutationResult<
  BatchResult,
  unknown,
  ProjectSkillRef[]
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (refs: ProjectSkillRef[]) => {
      const removedIds: string[] = [];
      const result = await runSequentially(
        refs,
        (ref) => ref.name,
        async (ref) => {
          removedIds.push(...(await api.projects.pullFromLibrary(ref.projectId, ref.relativePath)));
        },
      );
      toastBatchOutcome(
        t("projectPage.toast.pulledMany", { count: result.succeeded }),
        result.failed,
        { action: undoAction(removedIds) },
      );
      return result;
    },
    error: "projectPage.errors.pull",
  });
}

/** Push several project skills to the library. Updated, conflicting and failed are told apart. */
export function usePushManyToLibrary(): UseMutationResult<
  BatchPushResult,
  unknown,
  ProjectSkillRef[]
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (refs: ProjectSkillRef[]) => {
      const outcome: BatchPushResult = {
        updated: 0,
        conflicting: [],
        realignFailed: [],
        failed: [],
        removedIds: [],
      };
      const run = await runSequentially(
        refs,
        (ref) => ref.name,
        async (ref) => {
          const result = await api.projects.pushToLibrary(ref.projectId, ref.relativePath);
          outcome.removedIds.push(...result.removedIds);
          if (result.conflictingVariants > 0) outcome.conflicting.push(ref.name);
          else {
            outcome.updated += 1;
            if (result.realignFailed > 0) outcome.realignFailed.push(ref.name);
          }
        },
      );
      outcome.failed = run.failed;
      return outcome;
    },
    onSuccess: (outcome) => {
      if (outcome.updated > 0) {
        toastWithUndo(
          t("projectPage.toast.pushedMany", { count: outcome.updated }),
          outcome.removedIds,
        );
      }
      if (outcome.conflicting.length > 0) {
        toast.warning(
          t("projectPage.toast.pushConflictMany", { count: outcome.conflicting.length }),
          { description: outcome.conflicting.join(", ") },
        );
      }
      if (outcome.realignFailed.length > 0) {
        toast.warning(
          t("projectPage.toast.realignFailedMany", { count: outcome.realignFailed.length }),
          { description: outcome.realignFailed.join(", ") },
        );
      }
      if (outcome.failed.length > 0) {
        toast.error(t("projectPage.toast.pushFailedMany", { count: outcome.failed.length }), {
          description: describeFailures(outcome.failed),
          descriptionClassName: FAILURE_LIST_CLASS,
        });
      }
    },
    error: "projectPage.errors.push",
  });
}
