import {
  ApiError,
  type BatchResult,
  type Project,
  type SafetyRecord,
  type Skill,
  type UpdateResult,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { runWithUndo } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { GENERIC_ERROR_KEY, toastError } from "@/lib/toast";

/** Replace the file patterns of projects a skill is suggested for. */
export function useSetSuggestFor(): UseMutationResult<
  Skill,
  unknown,
  { skillId: string; patterns: string[] }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, patterns }) => api.skills.setSuggestFor(skillId, patterns),
    success: () => t("library.suggestFor.saved"),
    error: "library.suggestFor.errors.save",
  });
}

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
        void queryClient.invalidateQueries({ queryKey: keys.updates.comparison(skillId) });
      }
    },
    // What Compare showed is history now: the next update must not be held to it.
    onSuccess: (_result, { skillId }) =>
      queryClient.removeQueries({ queryKey: keys.updates.comparison(skillId) }),
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
  BatchResult,
  unknown,
  RemoveFromProjectInput
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skill, project, relativePaths }: RemoveFromProjectInput) =>
      runWithUndo(
        relativePaths,
        (relativePath) => relativePath,
        (relativePath) => api.projects.deleteSkill(project.id, relativePath),
        () => t("library.projects.removed", { name: skill.name, project: project.name }),
      ),
    error: "library.errors.removeFromProject",
  });
}

/** Scan one library skill now. */
export function useScanSkill(): UseMutationResult<SafetyRecord, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillId: string) => api.safety.scanSkill(skillId),
    success: (record) => t(`safety.scanned.${record.verdict}`),
    error: "safety.errors.scan",
  });
}

export interface SetSkillNoteInput {
  skillId: string;
  /** Blank takes the note off. */
  note: string;
}

/** Replace the user's note on one skill. */
export function useSetSkillNote(): UseMutationResult<Skill, unknown, SetSkillNoteInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, note }: SetSkillNoteInput) => api.skills.setNote(skillId, note),
    success: (skill) => (skill.note ? t("library.note.saved") : t("library.note.removed")),
    error: "library.note.errors.save",
  });
}
