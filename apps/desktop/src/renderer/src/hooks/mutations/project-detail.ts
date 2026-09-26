import type {
  BatchResult,
  CreateSkillInput,
  ProjectCopyRef,
  PushToLibraryOptions,
  PushToLibraryResult,
  SkillVersion,
} from "@loadout/shared";
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { describeFailures, runSequentially, toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

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

/** Project skills changed on disk; a push also changes the library. */
export function invalidateProject(queryClient: QueryClient, withLibrary = false): void {
  void queryClient.invalidateQueries({ queryKey: keys.projects.root });
  if (withLibrary) void queryClient.invalidateQueries({ queryKey: keys.skills.root });
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ skillId, projectId, agentKeys }: ExportSkillInput) =>
      api.projects.exportSkill(skillId, projectId, agentKeys),
    onSuccess: (_result, { name, targetName }) =>
      toastSuccess(
        targetName
          ? t("projectPage.toast.exportedTo", { name, target: targetName })
          : t("projectPage.toast.exported", { name }),
      ),
    onError: (error) => toastError(error, "projectPage.errors.export"),
    onSettled: () => invalidateProject(queryClient),
  });
}

export interface CreateProjectSkillInput {
  projectId: string;
  skill: CreateSkillInput;
  /** Agents whose project folders get the new skill. */
  agentKeys: string[];
}

/** Write a new skill straight into a project; resolves to the copy to open in the editor. */
export function useCreateProjectSkill(): UseMutationResult<
  ProjectCopyRef,
  unknown,
  CreateProjectSkillInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, skill, agentKeys }: CreateProjectSkillInput) =>
      api.projects.createSkill(projectId, skill, agentKeys),
    onError: (error) => toastError(error, "library.create.error"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Delete one copy of a project skill, or every copy when no target is given. */
export function useDeleteProjectSkill(): UseMutationResult<void, unknown, DeleteProjectSkillInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ projectId, relativePath, agentKey }: DeleteProjectSkillInput) =>
      api.projects.deleteSkill(projectId, relativePath, agentKey),
    onSuccess: (_result, { name, targetName }) =>
      toastSuccess(
        targetName
          ? t("projectPage.toast.removedFrom", { name, target: targetName })
          : t("projectPage.toast.deleted", { name }),
      ),
    onError: (error) => toastError(error, "projectPage.errors.delete"),
    onSettled: () => invalidateProject(queryClient),
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ projectId, relativePath, options }: PushToLibraryInput) =>
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
        });
      } else toastSuccess(t("projectPage.toast.pushed", { name }));
    },
    onError: (error) => toastError(error, "projectPage.errors.push"),
    onSettled: () => invalidateProject(queryClient, true),
  });
}

/** Replace every copy of a project skill with the library version. */
export function usePullFromLibrary(): UseMutationResult<void, unknown, PullFromLibraryInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ projectId, relativePath }: PullFromLibraryInput) =>
      api.projects.pullFromLibrary(projectId, relativePath),
    onSuccess: (_result, { name, restore }) =>
      toastSuccess(
        t(restore ? "projectPage.toast.restored" : "projectPage.toast.pulled", { name }),
      ),
    onError: (error) => toastError(error, "projectPage.errors.pull"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Switch every copy of a project skill on or off. */
export function useSetProjectSkillEnabled(): UseMutationResult<void, unknown, SetEnabledInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ projectId, relativePath, enabled }: SetEnabledInput) =>
      api.projects.setSkillEnabled(projectId, relativePath, enabled),
    onSuccess: (_result, { name, enabled }) =>
      toastSuccess(
        t(enabled ? "projectPage.toast.enabled" : "projectPage.toast.disabled", { name }),
      ),
    onError: (error) => toastError(error, "projectPage.errors.toggle"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Remember which agents to tick the next time skills are added to this project. */
export function useSetLastExportAgents(): UseMutationResult<
  void,
  unknown,
  { projectId: string; agentKeys: string[]; silent?: boolean }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ projectId, agentKeys }) =>
      api.projects.setLastExportAgents(projectId, agentKeys),
    onSuccess: (_result, { silent }) => {
      if (!silent) toastSuccess(t("projectPage.toast.defaultsSaved"));
    },
    onError: (error) => toastError(error, "projectPage.errors.saveDefaults"),
    onSettled: (_result, _error, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: keys.projects.lastExportAgents(projectId) }),
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
  return useMutation({
    mutationFn: async ({ projectId, jobs }) => {
      const result = await runSequentially(
        jobs,
        (job) => job.name,
        (job) => api.projects.exportSkill(job.skillId, projectId, job.agentKeys),
      );
      toastBatchOutcome(
        t("projectPage.toast.exportedMany", { count: result.succeeded }),
        result.failed,
      );
      if (result.succeeded === 0 && result.failed.length > 0) {
        throw new Error(t("projectPage.errors.export"));
      }
      return result;
    },
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Delete many single copies (skill × target), e.g. when a preset is taken out of a project. */
export function useDeleteVariants(): UseMutationResult<
  BatchResult,
  unknown,
  { projectId: string; jobs: readonly DeleteVariantJob[] }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ projectId, jobs }) =>
      runSequentially(
        jobs,
        (job) => job.name,
        (job) => api.projects.deleteSkill(projectId, job.relativePath, job.agentKey),
      ),
    onSuccess: (result) =>
      toastBatchOutcome(
        t("projectPage.toast.removedCopies", { count: result.succeeded }),
        result.failed,
      ),
    onError: (error) => toastError(error, "projectPage.errors.delete"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Delete every copy of several project skills. */
export function useDeleteProjectSkills(): UseMutationResult<
  BatchResult,
  unknown,
  ProjectSkillRef[]
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (refs: ProjectSkillRef[]) =>
      runSequentially(
        refs,
        (ref) => ref.name,
        (ref) => api.projects.deleteSkill(ref.projectId, ref.relativePath),
      ),
    onSuccess: (result) =>
      toastBatchOutcome(
        t("projectPage.toast.deletedMany", { count: result.succeeded }),
        result.failed,
      ),
    onError: (error) => toastError(error, "projectPage.errors.delete"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Switch several project skills on or off. */
export function useSetProjectSkillsEnabled(): UseMutationResult<
  BatchResult,
  unknown,
  { refs: ProjectSkillRef[]; enabled: boolean }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ refs, enabled }) =>
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
    onError: (error) => toastError(error, "projectPage.errors.toggle"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Replace several project skills with their library versions. */
export function usePullManyFromLibrary(): UseMutationResult<
  BatchResult,
  unknown,
  ProjectSkillRef[]
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (refs: ProjectSkillRef[]) =>
      runSequentially(
        refs,
        (ref) => ref.name,
        (ref) => api.projects.pullFromLibrary(ref.projectId, ref.relativePath),
      ),
    onSuccess: (result) =>
      toastBatchOutcome(
        t("projectPage.toast.pulledMany", { count: result.succeeded }),
        result.failed,
      ),
    onError: (error) => toastError(error, "projectPage.errors.pull"),
    onSettled: () => invalidateProject(queryClient),
  });
}

/** Push several project skills to the library. Updated, conflicting and failed are told apart. */
export function usePushManyToLibrary(): UseMutationResult<
  BatchPushResult,
  unknown,
  ProjectSkillRef[]
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (refs: ProjectSkillRef[]) => {
      const outcome: BatchPushResult = {
        updated: 0,
        conflicting: [],
        realignFailed: [],
        failed: [],
      };
      const run = await runSequentially(
        refs,
        (ref) => ref.name,
        async (ref) => {
          const result = await api.projects.pushToLibrary(ref.projectId, ref.relativePath);
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
        toastSuccess(t("projectPage.toast.pushedMany", { count: outcome.updated }));
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
          descriptionClassName: "text-xs whitespace-pre-line break-all",
        });
      }
    },
    onError: (error) => toastError(error, "projectPage.errors.push"),
    onSettled: () => invalidateProject(queryClient, true),
  });
}
