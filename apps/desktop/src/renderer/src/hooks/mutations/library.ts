import {
  type BatchResult,
  type BatchUpdateResult,
  type ExportResult,
  type Project,
  type Skill,
  type UpdateResult,
  formatBytes,
  formatTimestampCompact,
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
import { EXPORT_FILE_EXTENSION, EXPORT_MANY_PREFIX } from "@/lib/constants";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** What replaces a skill's library content: upstream, its source folder, or a new source folder. */
export type SkillRefreshRequest =
  | { kind: "update" }
  | { kind: "reimport" }
  | { kind: "relink"; sourcePath: string };

export interface RefreshSkillInput {
  skillId: string;
  request: SkillRefreshRequest;
  /** Token from a previous answer that listed files to be removed. */
  approval?: string | null;
}

/** Key the backend reports progress under, and the key that cancels a running update. */
export function updateProgressKey(skillId: string): string {
  return `update:${skillId}`;
}

function invalidateSkills(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: keys.skills.root });
  void queryClient.invalidateQueries({ queryKey: keys.updates.root });
  void queryClient.invalidateQueries({ queryKey: keys.workspace.root });
}

function describeFailures(failed: readonly { name: string; message: string }[]): string {
  return failed.map((failure) => `${failure.name}: ${failure.message}`).join("\n");
}

const FAILURE_LIST_CLASS = "text-xs whitespace-pre-line break-words";

/** Look upstream for every skill that has a source. */
export function useCheckAllUpdates(): UseMutationResult<BatchResult, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.updates.checkAll(true),
    onSuccess: (result) => {
      const summary = t("library.updates.checked", { count: result.succeeded });
      if (result.failed.length === 0) {
        toastSuccess(summary);
        return;
      }
      toast.warning(
        t("library.updates.checkedWithFailures", { summary, count: result.failed.length }),
        { description: describeFailures(result.failed), descriptionClassName: FAILURE_LIST_CLASS },
      );
    },
    onError: (error) => toastError(error, "library.errors.check"),
    onSettled: () => invalidateSkills(queryClient),
  });
}

/** Look upstream for one skill, ignoring the cached answer. */
export function useCheckSkillUpdate(): UseMutationResult<Skill, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (skillId: string) => api.updates.check(skillId, true),
    onSuccess: (skill) => {
      if (skill.updateStatus === "error") {
        toastError(skill.lastCheckError, "library.errors.check");
        return;
      }
      toastSuccess(t(`updateStatus.${skill.updateStatus}`), skill.name);
    },
    onError: (error) => toastError(error, "library.errors.check"),
    onSettled: () => invalidateSkills(queryClient),
  });
}

/** Update several skills. Skills whose update would delete files are held back, never forced. */
export function useUpdateSkills(): UseMutationResult<BatchUpdateResult, unknown, string[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (skillIds: string[]) => api.updates.updateMany(skillIds),
    onSuccess: (result) => {
      const summary = t("library.updates.batchDone", {
        count: result.updated,
        unchanged: result.unchanged,
      });
      const lines = [
        ...(result.heldBack.length > 0
          ? [t("library.updates.heldBack", { names: result.heldBack.join(", ") })]
          : []),
        ...(result.failed.length > 0 ? [describeFailures(result.failed)] : []),
      ];
      if (lines.length === 0) {
        toastSuccess(summary);
        return;
      }
      toast.warning(summary, {
        description: lines.join("\n"),
        descriptionClassName: FAILURE_LIST_CLASS,
      });
    },
    onError: (error) => toastError(error, "library.errors.update"),
    onSettled: () => invalidateSkills(queryClient),
  });
}

/**
 * Update, re-import or relink one skill. Silent: the answer may list files that would be removed,
 * in which case nothing changed and the caller asks the user before calling again with `approval`.
 */
export function useRefreshSkill(): UseMutationResult<UpdateResult, unknown, RefreshSkillInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, request, approval }: RefreshSkillInput) => {
      if (request.kind === "update") return api.updates.update(skillId, approval ?? null);
      if (request.kind === "reimport") return api.updates.reimport(skillId, approval ?? null);
      return api.updates.relink(skillId, request.sourcePath, approval ?? null);
    },
    onError: (error) => toastError(error, "library.errors.update"),
    onSettled: () => invalidateSkills(queryClient),
  });
}

/** Stop a running install or update. Resolves to false when nothing was running under the key. */
export function useCancelInstall(): UseMutationResult<boolean, unknown, string> {
  return useMutation({
    mutationFn: (key: string) => api.install.cancel(key),
    onError: (error) => toastError(error),
  });
}

/** Forget where a skill came from. The library copy stays as it is. */
export function useDetachSkill(): UseMutationResult<Skill, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (skillId: string) => api.updates.detach(skillId),
    onSuccess: (skill) => toastSuccess(t("library.source.detached", { name: skill.name })),
    onError: (error) => toastError(error, "library.errors.detach"),
    onSettled: () => invalidateSkills(queryClient),
  });
}

/** Open the skill's library folder in the OS file manager. */
export function useRevealSkill(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (skillId: string) => api.skills.reveal(skillId),
    onError: (error) => toastError(error, "errors.reveal"),
  });
}

/** File name "Save as" suggests: the skill's folder name, or a stamped name for several. */
function exportFileName(skills: readonly Skill[]): string {
  const [only] = skills;
  const stem =
    only && skills.length === 1
      ? only.dirName
      : `${EXPORT_MANY_PREFIX}${formatTimestampCompact(Date.now())}`;
  return `${stem}${EXPORT_FILE_EXTENSION}`;
}

/**
 * Save skills as one `.zip`: asks where, writes it, and offers to show the file. Resolves to null
 * when the user cancels the "Save as" dialog.
 */
export function useExportSkills(): UseMutationResult<
  ExportResult | null,
  unknown,
  readonly Skill[]
> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (skills: readonly Skill[]) => {
      const path = await api.app.pickSavePath(
        exportFileName(skills),
        t("library.export.dialogTitle", { count: skills.length }),
      );
      if (!path) return null;
      return api.skills.exportArchive(
        skills.map((skill) => skill.id),
        path,
      );
    },
    onSuccess: (result) => {
      if (!result) return;
      toast.success(t("library.export.done", { count: result.skillCount }), {
        description: t("library.export.doneDescription", {
          path: result.path,
          size: formatBytes(result.bytes),
        }),
        descriptionClassName: "font-mono text-xs break-all",
        action: {
          label: t("library.export.showFile"),
          onClick: () => void api.app.revealPath(result.path).catch(toastError),
        },
      });
    },
    onError: (error) => toastError(error, "library.export.failed"),
  });
}

/** Native folder picker. Resolves to null when the user cancels. */
export function usePickFolder(): UseMutationResult<string | null, unknown, string | undefined> {
  return useMutation({
    mutationFn: (title?: string) => api.app.pickFolder(title),
    onError: (error) => toastError(error),
  });
}

export interface SkillProjectInput {
  skill: Skill;
  project: Project;
}

/**
 * Copy a library skill into a project: to the agents used for that project last time, or to every
 * available project agent when nothing was remembered.
 */
export function useExportSkillToProject(): UseMutationResult<void, unknown, SkillProjectInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ skill, project }: SkillProjectInput) => {
      const remembered = await api.projects.lastExportAgents(project.id);
      const agentKeys =
        remembered.length > 0
          ? remembered
          : (await api.projects.targets(project.id))
              .filter((target) => target.enabled && target.installed)
              .flatMap((target) => target.agentKeys);
      await api.projects.exportSkill(skill.id, project.id, agentKeys);
    },
    onSuccess: (_result, { skill, project }) =>
      toastSuccess(t("library.projects.added", { name: skill.name, project: project.name })),
    onError: (error) => toastError(error, "library.errors.exportToProject"),
    onSettled: (_result, _error, { project }) => {
      void queryClient.invalidateQueries({ queryKey: keys.projects.skills(project.id) });
      void queryClient.invalidateQueries({ queryKey: keys.projects.all });
    },
  });
}

export interface RemoveFromProjectInput extends SkillProjectInput {
  /** Project-relative paths of the copies to delete (every agent's copy at each path). */
  relativePaths: string[];
}

/** Delete a skill's copies from a project folder. */
export function useRemoveSkillFromProject(): UseMutationResult<
  void,
  unknown,
  RemoveFromProjectInput
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ project, relativePaths }: RemoveFromProjectInput) => {
      for (const relativePath of relativePaths) {
        await api.projects.deleteSkill(project.id, relativePath);
      }
    },
    onSuccess: (_result, { skill, project }) =>
      toastSuccess(t("library.projects.removed", { name: skill.name, project: project.name })),
    onError: (error) => toastError(error, "library.errors.removeFromProject"),
    onSettled: (_result, _error, { project }) => {
      void queryClient.invalidateQueries({ queryKey: keys.projects.skills(project.id) });
      void queryClient.invalidateQueries({ queryKey: keys.projects.all });
    },
  });
}
