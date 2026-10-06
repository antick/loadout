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
import { runBatch, runWithUndo, soleItem, toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { toastWithUndo, undoAction } from "@/lib/removed-undo";
import { describeFailures, FAILURE_LIST_CLASS, toastError } from "@/lib/toast";

/** One logical skill of a project: every per-agent copy at this relative path. */
export interface ProjectSkillRef {
  projectId: string;
  relativePath: string;
  name: string;
}

export interface ExportJob {
  skillId: string;
  name: string;
  /** Target keys to write to. */
  agentKeys: string[];
  /** Shown in the toast of a single job, e.g. the target's display name. */
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

export interface PushToLibraryInput extends ProjectSkillRef {
  /** Which version to add, and whether the other copies follow; see `PushToLibraryOptions`. */
  options?: PushToLibraryOptions;
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
  /** The disagreeing copies of a batch of one skill, for the user to pick from. */
  versions: SkillVersion[];
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

/**
 * Copy library skills into a project, one skill × target job after the other, and toast one
 * summary. Rejects when nothing could be added, so a picker stays open with the selection intact.
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
      const result = await runBatch(
        jobs,
        (job) => job.name,
        (job) => api.projects.exportSkill(job.skillId, projectId, job.agentKeys),
      ).catch((error: unknown) => {
        toastError(error, "projectPage.errors.export");
        throw error;
      });
      const only = soleItem(jobs);
      const summary = only
        ? only.targetName
          ? t("projectPage.toast.exportedTo", { name: only.name, target: only.targetName })
          : t("projectPage.toast.exported", { name: only.name })
        : t("projectPage.toast.exportedMany", { count: result.succeeded });
      const agentKeys = jobs.flatMap((job) => job.agentKeys);
      toastBatchOutcome(summary, result.failed, {
        description: result.succeeded > 0 ? reloadHintFor(queryClient, agentKeys) : null,
      });
      if (result.succeeded === 0 && result.failed.length > 0) {
        throw new Error(t("projectPage.errors.export"));
      }
      return result;
    },
    error: false,
  });
}

/** Delete project skills: one target's copy each when `agentKey` is set, else every copy. */
export function useDeleteProjectSkills(): UseMutationResult<
  BatchResult,
  unknown,
  readonly DeleteProjectSkillInput[]
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (jobs) =>
      runWithUndo(
        jobs,
        (job) => job.name,
        (job) => api.projects.deleteSkill(job.projectId, job.relativePath, job.agentKey),
        (count) => {
          const only = soleItem(jobs);
          if (only) {
            return only.targetName
              ? t("projectPage.toast.removedFrom", { name: only.name, target: only.targetName })
              : t("projectPage.toast.deleted", { name: only.name });
          }
          const copies = jobs.every((job) => job.agentKey !== undefined);
          return t(copies ? "projectPage.toast.removedCopies" : "projectPage.toast.deletedMany", {
            count,
          });
        },
      ),
    error: "projectPage.errors.delete",
  });
}

/** Replace every copy of project skills with the library version. */
export function usePullFromLibrary(): UseMutationResult<
  BatchResult,
  unknown,
  readonly PullFromLibraryInput[]
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (jobs) =>
      runWithUndo(
        jobs,
        (job) => job.name,
        (job) => api.projects.pullFromLibrary(job.projectId, job.relativePath),
        (count) => {
          const only = soleItem(jobs);
          if (only) {
            return t(only.restore ? "projectPage.toast.restored" : "projectPage.toast.pulled", {
              name: only.name,
            });
          }
          return t("projectPage.toast.pulledMany", { count });
        },
      ),
    error: "projectPage.errors.pull",
  });
}

/** Switch every copy of project skills on or off. */
export function useSetProjectSkillsEnabled(): UseMutationResult<
  BatchResult,
  unknown,
  { refs: readonly ProjectSkillRef[]; enabled: boolean }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ refs, enabled }) =>
      runBatch(
        refs,
        (ref) => ref.name,
        (ref) => api.projects.setSkillEnabled(ref.projectId, ref.relativePath, enabled),
      ),
    onSuccess: (result, { refs, enabled }) => {
      const only = soleItem(refs);
      const summary = only
        ? t(enabled ? "projectPage.toast.enabled" : "projectPage.toast.disabled", {
            name: only.name,
          })
        : t(enabled ? "projectPage.toast.enabledMany" : "projectPage.toast.disabledMany", {
            count: result.succeeded,
          });
      toastBatchOutcome(summary, result.failed);
    },
    error: "projectPage.errors.toggle",
  });
}

/** Remember which agents to tick the next time skills are added to this project. */
export function useSetLastExportAgents(): UseMutationResult<
  void,
  unknown,
  { projectId: string; agentKeys: string[] }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ projectId, agentKeys }) => api.projects.setLastExportAgents(projectId, agentKeys),
    success: () => t("projectPage.toast.defaultsSaved"),
    error: "projectPage.errors.saveDefaults",
    invalidate: ({ projectId }) => [keys.projects.lastExportAgents(projectId)],
  });
}

/** The toasts of a push of one skill: its own wording, and a version choice when copies differ. */
function toastSinglePush(
  t: ReturnType<typeof useTranslation>["t"],
  job: PushToLibraryInput,
  outcome: BatchPushResult,
  onChooseVersion?: (ref: ProjectSkillRef, versions: SkillVersion[]) => void,
): void {
  const { projectId, relativePath, name } = job;
  if (outcome.conflicting.length > 0) {
    if (onChooseVersion) onChooseVersion({ projectId, relativePath, name }, outcome.versions);
    else {
      toast.warning(t("projectPage.toast.pushConflictTitle", { name }), {
        description: t("projectPage.toast.pushConflict"),
      });
    }
  } else if (outcome.realignFailed.length > 0) {
    toast.warning(t("projectPage.toast.pushed", { name }), {
      description: t("projectPage.toast.realignFailed", { count: outcome.realignFailed.length }),
      action: undoAction(outcome.removedIds),
    });
  } else toastWithUndo(t("projectPage.toast.pushed", { name }), outcome.removedIds);
}

/**
 * Push project skills to the library. Updated, conflicting and failed are told apart. When the
 * copies of a single skill disagree nothing is written and `onChooseVersion` gets the versions,
 * so the user can pick one.
 */
export function usePushToLibrary(
  onChooseVersion?: (ref: ProjectSkillRef, versions: SkillVersion[]) => void,
): UseMutationResult<BatchPushResult, unknown, readonly PushToLibraryInput[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (jobs) => {
      const outcome: BatchPushResult = {
        updated: 0,
        conflicting: [],
        realignFailed: [],
        failed: [],
        removedIds: [],
        versions: [],
      };
      const run = await runBatch(
        jobs,
        (job) => job.name,
        async (job) => {
          const result: PushToLibraryResult = await api.projects.pushToLibrary(
            job.projectId,
            job.relativePath,
            job.options,
          );
          outcome.removedIds.push(...result.removedIds);
          if (result.conflictingVariants > 0) {
            outcome.conflicting.push(job.name);
            outcome.versions = result.versions;
          } else {
            outcome.updated += 1;
            if (result.realignFailed > 0) outcome.realignFailed.push(job.name);
          }
        },
      );
      outcome.failed = run.failed;
      return outcome;
    },
    onSuccess: (outcome, jobs) => {
      const only = soleItem(jobs);
      if (only) {
        toastSinglePush(t, only, outcome, onChooseVersion);
        return;
      }
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
