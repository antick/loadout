import {
  ApiError,
  type SkillsFileApplyOptions,
  type SkillsFileInfo,
  type SkillsFileInit,
  type SkillsFileResult,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { askToInstallFlagged } from "@/features/safety/flagged-prompt";
import type { SkillsFileMode } from "@/hooks/queries/skills-file";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Write a new `skills.toml` in the project folder. */
export function useCreateSkillsFile(): UseMutationResult<
  SkillsFileInfo,
  unknown,
  { dir: string; init: SkillsFileInit }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ dir, init }) => api.skillsFile.create(dir, init),
    onSuccess: () => toastSuccess(t("skillsFile.created")),
    onError: (error) => toastError(error, "skillsFile.errors.create"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.skillsFile.root }),
  });
}

/**
 * Apply, update or unapply, with one toast saying what happened and what was kept. When the
 * safety check flags a skill the user is asked, as for any install, and a yes runs it again.
 * Null when they said no: nothing was written.
 */
export function useRunSkillsFile(): UseMutationResult<
  SkillsFileResult | null,
  unknown,
  { dir: string; mode: SkillsFileMode; options: SkillsFileApplyOptions }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ dir, mode, options }) => {
      if (mode === "unapply") return api.skillsFile.unapply(dir, { force: options.force });
      const apply = { ...options, update: mode === "update" };
      try {
        return await api.skillsFile.apply(dir, apply);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNSAFE") throw error;
        if (!(await askToInstallFlagged(error.details))) return null;
        return api.skillsFile.apply(dir, { ...apply, acceptRisk: true });
      }
    },
    onSuccess: (result, { mode }) => {
      if (!result) {
        toast.info(t("safety.prompt.notInstalled"));
        return;
      }
      const unapplied = mode === "unapply";
      const summary = unapplied
        ? t("skillsFile.unapplied", { count: result.removed })
        : t("skillsFile.done", { count: result.written });
      const removed =
        !unapplied && result.removed > 0
          ? t("skillsFile.removedNote", { count: result.removed })
          : undefined;
      if (result.kept.length === 0) {
        toastSuccess(summary, removed);
        return;
      }
      const kept = t("skillsFile.keptNote", { folders: result.kept.join(", ") });
      toast.warning(summary, { description: [removed, kept].filter(Boolean).join("\n") });
    },
    onError: (error) => toastError(error, "skillsFile.errors.apply"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.skillsFile.root });
      void queryClient.invalidateQueries({ queryKey: keys.projects.root });
    },
  });
}
