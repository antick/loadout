import {
  type SkillsFileApplyOptions,
  type SkillsFileInfo,
  type SkillsFileInit,
  type SkillsFileResult,
} from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { SkillsFileMode } from "@/features/projects/skills-file-queries";
import { DECLINED, runWithRiskConsent } from "@/features/safety/flagged-prompt";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastSuccess } from "@/lib/toast";

/** Write a new `skills.toml` in the project folder. */
export function useCreateSkillsFile(): UseMutationResult<
  SkillsFileInfo,
  unknown,
  { dir: string; init: SkillsFileInit }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ dir, init }) => api.skillsFile.create(dir, init),
    success: () => t("skillsFile.created"),
    error: "skillsFile.errors.create",
    invalidate: [keys.skillsFile.root],
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
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ dir, mode, options }) => {
      if (mode === "unapply") return api.skillsFile.unapply(dir, { force: options.force });
      const apply = { ...options, update: mode === "update" };
      const result = await runWithRiskConsent(
        () => api.skillsFile.apply(dir, apply),
        () => api.skillsFile.apply(dir, { ...apply, acceptRisk: true }),
        {
          action: mode === "update" ? "update" : "install",
          declined: t(`skillsFile.declined.${mode}`),
        },
      );
      return result === DECLINED ? null : result;
    },
    onSuccess: (result, { mode }) => {
      if (!result) return;
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
    error: "skillsFile.errors.apply",
    invalidate: [keys.skillsFile.root],
  });
}
