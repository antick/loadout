import {
  type BatchResult,
  type CreateSkillInput,
  type ExportResult,
  formatBytes,
  formatTimestampCompact,
  type ProjectCopyRef,
  type RenameResult,
  type Skill,
} from "@loadout/shared";
import { type UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { toastBatchOutcome } from "@/lib/batch";
import { EXPORT_FILE_EXTENSION, EXPORT_MANY_PREFIX } from "@/lib/constants";
import { toastError, toastSuccess } from "@/lib/toast";

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
  return useApiMutation({
    fn: ({ projectId, skill, agentKeys }: CreateProjectSkillInput) =>
      api.projects.createSkill(projectId, skill, agentKeys),
    error: "library.create.error",
  });
}

export interface SetBlockedInput {
  skillId: string;
  agentKeys: string[];
  blocked: boolean;
}

/** Block or allow a skill for agents. Blocking also removes it from an agent it is deployed to. */
export function useSetBlocked(): UseMutationResult<Skill, unknown, SetBlockedInput> {
  return useApiMutation({
    fn: ({ skillId, agentKeys, blocked }: SetBlockedInput) =>
      api.deploy.setBlocked(skillId, agentKeys, blocked),
    error: "errors.block",
  });
}

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
    onSuccess: (result) =>
      toastBatchOutcome(t("library.updates.checked", { count: result.succeeded }), result.failed),
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

/** Rename a library skill, its deployments and project links; says what could not follow. */
export function useRenameSkill(): UseMutationResult<
  RenameResult,
  unknown,
  { skillId: string; name: string }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, name }) => api.skills.rename(skillId, name),
    onSuccess: (result) =>
      toastBatchOutcome(
        t("library.rename.done", { from: result.from, to: result.to }),
        result.failed,
        {
          description: result.failed.length > 0 ? t("library.rename.redeployHint") : null,
        },
      ),
    error: "library.rename.error",
  });
}
