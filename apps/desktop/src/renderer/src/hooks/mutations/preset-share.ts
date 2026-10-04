import {
  ApiError,
  PRESET_FILE_DIALOG_EXTENSIONS,
  type Preset,
  type PresetExportResult,
  type PresetImportPlan,
  type PresetImportResult,
  presetFileName,
} from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { askToInstallFlagged } from "@/features/safety/flagged-prompt";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

/** Save a preset as a file to share, chosen in a "Save as" dialog. Null when cancelled. */
export function useExportPreset(): UseMutationResult<PresetExportResult | null, unknown, Preset> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async (preset: Preset) => {
      const path = await api.app.pickSavePath(
        presetFileName(preset.name),
        t("presetShare.export.dialogTitle", { name: preset.name }),
        { name: t("presetShare.fileType"), extensions: PRESET_FILE_DIALOG_EXTENSIONS },
      );
      return path ? api.presets.exportFile(preset.id, path) : null;
    },
    onSuccess: (result) => {
      if (!result) return;
      toast.success(t("presetShare.export.done", { count: result.skills }), {
        description: [
          result.path,
          result.embedded > 0 ? t("presetShare.export.embedded", { count: result.embedded }) : "",
        ]
          .filter(Boolean)
          .join("\n"),
        descriptionClassName: "font-mono text-xs break-all whitespace-pre-line",
        action: {
          label: t("presetShare.export.showFile"),
          onClick: () => void api.app.revealPath(result.path).catch(toastError),
        },
      });
    },
    error: "presetShare.export.failed",
  });
}

/** Read a preset file or link and say what importing it would do. */
export function usePreviewPresetImport(): UseMutationResult<PresetImportPlan, unknown, string> {
  return useApiMutation({
    fn: (input: string) => api.presets.previewImport(input),
    error: false,
  });
}

/**
 * Import a preset file. When the safety check flags a skill the user is asked, as for any
 * install, and a yes runs the import again: what went in the first time is reused.
 */
export function useImportPreset(): UseMutationResult<
  PresetImportResult | null,
  unknown,
  { input: string; name?: string }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ input, name }) => {
      try {
        return await api.presets.importFile(input, { name });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNSAFE") throw error;
        if (!(await askToInstallFlagged(error.details))) return null;
        return api.presets.importFile(input, { name, acceptRisk: true });
      }
    },
    onSuccess: (result) => {
      if (!result) return;
      const notes = [
        result.installed.length > 0
          ? t("presetShare.import.installed", { count: result.installed.length })
          : "",
        result.reused.length > 0
          ? t("presetShare.import.reused", { count: result.reused.length })
          : "",
        ...result.failed.map((failure) =>
          t("presetShare.import.failedOne", { name: failure.name, message: failure.message }),
        ),
      ].filter(Boolean);
      const show = result.failed.length > 0 ? toast.warning : toast.success;
      show(t("presetShare.import.done", { name: result.preset.name }), {
        description: notes.join("\n"),
        descriptionClassName: "whitespace-pre-line",
      });
    },
    error: "presetShare.import.failed",
  });
}
