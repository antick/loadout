import {
  ApiError,
  type BatchResult,
  type CreateSkillInput,
  type BatchUpdateResult,
  type ExportResult,
  type Project,
  type Skill,
  type UpdateResult,
  formatBytes,
  formatTimestampCompact,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { EXPORT_FILE_EXTENSION, EXPORT_MANY_PREFIX } from "@/lib/constants";
import { keys } from "@/lib/query-keys";
import { toastWithUndo } from "@/lib/removed-undo";
import { GENERIC_ERROR_KEY, toastError, toastSuccess } from "@/lib/toast";

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
  /** The user read the safety findings of the new version and said to go ahead. */
  acceptRisk?: boolean;
  /** The upstream revision Compare showed; a newer one is refused instead of installed. */
  expectedRevision?: string | null;
}

/** Key the backend reports progress under, and the key that cancels a running update. */
export function updateProgressKey(skillId: string): string {
  return `update:${skillId}`;
}

function describeFailures(failed: readonly { name: string; message: string }[]): string {
  return failed.map((failure) => `${failure.name}: ${failure.message}`).join("\n");
}

const FAILURE_LIST_CLASS = "text-xs whitespace-pre-line break-words";

/** Write a new skill into the library. The dialog that calls it words the success itself. */
export function useCreateSkill(): UseMutationResult<Skill, unknown, CreateSkillInput> {
  return useApiMutation({
    fn: (input: CreateSkillInput) => api.skills.create(input),
    error: "library.create.error",
  });
}

/** Look upstream for every skill that has a source. */
export function useCheckAllUpdates(): UseMutationResult<BatchResult, unknown, void> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: () => api.updates.checkAll(true),
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
    error: "library.errors.check",
  });
}

/** Look upstream for one skill, ignoring the cached answer. */
export function useCheckSkillUpdate(): UseMutationResult<Skill, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillId: string) => api.updates.check(skillId, true),
    onSuccess: (skill) => {
      if (skill.updateStatus === "error") {
        toastError(skill.lastCheckError, "library.errors.check");
        return;
      }
      toastSuccess(t(`updateStatus.${skill.updateStatus}`), skill.name);
    },
    error: "library.errors.check",
  });
}

/** Look upstream for several skills, such as everything from one source, with one toast. */
export function useCheckSkills(): UseMutationResult<
  Skill[],
  unknown,
  { skillIds: readonly string[]; label: string }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ skillIds }) => {
      const checked: Skill[] = [];
      for (const skillId of skillIds) checked.push(await api.updates.check(skillId, true));
      return checked;
    },
    onSuccess: (checked, { label }) => {
      const updates = checked.filter((skill) => skill.updateStatus === "update_available");
      const failed = checked.filter((skill) => skill.updateStatus === "error");
      const summary = t("sources.checkedToast", { source: label, count: updates.length });
      if (failed.length === 0) {
        toastSuccess(summary);
        return;
      }
      toast.warning(summary, {
        description: describeFailures(
          failed.map((skill) => ({ name: skill.name, message: skill.lastCheckError ?? "" })),
        ),
        descriptionClassName: FAILURE_LIST_CLASS,
      });
    },
    error: "library.errors.check",
  });
}

/** Update several skills. Skills whose update would delete files are held back, never forced. */
export function useUpdateSkills(): UseMutationResult<BatchUpdateResult, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillIds: string[]) => api.updates.updateMany(skillIds),
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
    error: "library.errors.update",
  });
}

/**
 * Update, re-import or relink one skill. Silent: the answer may list files that would be removed,
 * in which case nothing changed and the caller asks the user before calling again with `approval`.
 */
export function useRefreshSkill(): UseMutationResult<UpdateResult, unknown, RefreshSkillInput> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ skillId, request, approval, acceptRisk, expectedRevision }: RefreshSkillInput) => {
      const options = { acceptRisk };
      if (request.kind === "update") {
        return api.updates.update(skillId, approval ?? null, { ...options, expectedRevision });
      }
      if (request.kind === "reimport") {
        return api.updates.reimport(skillId, approval ?? null, options);
      }
      return api.updates.relink(skillId, request.sourcePath, approval ?? null, options);
    },
    // A flagged new version is the caller's to ask about, not an error to toast.
    error: false,
    onError: (error, { skillId }) => {
      if (!(error instanceof ApiError && error.code === "UNSAFE")) {
        toastError(error, "library.errors.update");
      }
      // Upstream moved on since Compare: show the new comparison.
      if (error instanceof ApiError && error.code === "CHANGED_ON_DISK") {
        void queryClient.invalidateQueries({ queryKey: keys.updates.sourceDiff(skillId) });
      }
    },
    // What Compare showed is history now: the next update must not be held to it.
    onSuccess: (_result, { skillId }) =>
      queryClient.removeQueries({ queryKey: keys.updates.sourceDiff(skillId) }),
  });
}

/** Stop a running install or update. Resolves to false when nothing was running under the key. */
export function useCancelInstall(): UseMutationResult<boolean, unknown, string> {
  return useApiMutation({
    fn: (key: string) => api.install.cancel(key),
    error: GENERIC_ERROR_KEY,
  });
}

/** Forget where a skill came from. The library copy stays as it is. */
export function useDetachSkill(): UseMutationResult<Skill, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillId: string) => api.updates.detach(skillId),
    success: (skill) => t("library.source.detached", { name: skill.name }),
    error: "library.errors.detach",
  });
}

/** A skill whose source is gone: forget the source and mark it as the user's own. */
export function useKeepSkillAsMine(): UseMutationResult<Skill, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillId: string) => api.updates.detach(skillId, { markAuthored: true }),
    success: (skill) => ({
      message: t("library.sourceGone.kept", { name: skill.name }),
      description: t("library.sourceGone.keptHint"),
    }),
    error: "library.errors.detach",
  });
}

/** Open the skill's library folder in the OS file manager. */
export function useRevealSkill(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (skillId: string) => api.skills.reveal(skillId),
    error: "errors.reveal",
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
  return useApiMutation({
    fn: async (skills: readonly Skill[]) => {
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
    error: "library.export.failed",
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
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ skill, project }: SkillProjectInput) => {
      const remembered = await api.projects.lastExportAgents(project.id);
      const agentKeys =
        remembered.length > 0
          ? remembered
          : (await api.projects.targets(project.id))
              .filter((target) => target.enabled && target.installed)
              .flatMap((target) => target.agentKeys);
      await api.projects.exportSkill(skill.id, project.id, agentKeys);
    },
    success: (_result, { skill, project }) =>
      t("library.projects.added", { name: skill.name, project: project.name }),
    error: "library.errors.exportToProject",
  });
}

export interface RemoveFromProjectInput extends SkillProjectInput {
  /** Project-relative paths of the copies to delete (every agent's copy at each path). */
  relativePaths: string[];
}

/** Delete a skill's copies from a project folder. */
export function useRemoveSkillFromProject(): UseMutationResult<
  string[],
  unknown,
  RemoveFromProjectInput
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ project, relativePaths }: RemoveFromProjectInput) => {
      const removedIds: string[] = [];
      for (const relativePath of relativePaths) {
        removedIds.push(...(await api.projects.deleteSkill(project.id, relativePath)));
      }
      return removedIds;
    },
    onSuccess: (removedIds, { skill, project }) =>
      toastWithUndo(
        t("library.projects.removed", { name: skill.name, project: project.name }),
        removedIds,
      ),
    error: "library.errors.removeFromProject",
  });
}
