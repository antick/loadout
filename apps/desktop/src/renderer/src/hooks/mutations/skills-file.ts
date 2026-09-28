import type {
  SkillsFileApplyOptions,
  SkillsFileInfo,
  SkillsFileInit,
  SkillsFileResult,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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

/** Apply, update or unapply, with one toast saying what happened and what was kept. */
export function useRunSkillsFile(): UseMutationResult<
  SkillsFileResult,
  unknown,
  { dir: string; mode: SkillsFileMode; options: SkillsFileApplyOptions }
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ dir, mode, options }) =>
      mode === "unapply"
        ? api.skillsFile.unapply(dir, { force: options.force })
        : api.skillsFile.apply(dir, { ...options, update: mode === "update" }),
    onSuccess: (result, { mode }) => {
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
