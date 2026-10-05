import {
  ApiError,
  type ApplyResult,
  type Preset,
  PRESET_FILE_DIALOG_EXTENSIONS,
  type PresetAgentToggle,
  type PresetExportResult,
  presetFileName,
  type PresetImportPlan,
  type PresetImportResult,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { askToInstallFlagged } from "@/features/safety/flagged-prompt";
import { patchPresetSkills } from "@/hooks/mutations/preset-members";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { reloadHintFor, reloadHintForAvailable } from "@/lib/agent-reload";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCached, restoreCached } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";
import { toastApplyResult, toastError } from "@/lib/toast";

/** Persist a new skill order inside a preset; the cached preset is reordered at once. */
export function useReorderPresetSkills(): UseMutationResult<
  void,
  unknown,
  { presetId: string; skillIds: string[] },
  CacheSnapshot
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ presetId, skillIds }) => api.presets.reorderSkills(presetId, skillIds),
    onMutate: ({ presetId, skillIds }) => patchPresetSkills(queryClient, presetId, () => skillIds),
    error: "errors.reorder",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}

export interface SetPresetToggleInput {
  presetId: string;
  skillId: string;
  agentKey: string;
  enabled: boolean;
}

/** Choose whether applying the preset gives this skill to this agent. The switch flips at once. */
export function useSetPresetToggle(): UseMutationResult<
  void,
  unknown,
  SetPresetToggleInput,
  CacheSnapshot
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ presetId, skillId, agentKey, enabled }: SetPresetToggleInput) =>
      api.presets.setToggle(presetId, skillId, agentKey, enabled),
    onMutate: ({ presetId, skillId, agentKey, enabled }) =>
      patchCached<PresetAgentToggle[]>(
        queryClient,
        keys.presets.toggles(presetId, skillId),
        (toggles) =>
          toggles.map((toggle) => (toggle.agentKey === agentKey ? { ...toggle, enabled } : toggle)),
      ),
    error: "presetPage.errors.toggle",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}

export interface ApplyPresetInput {
  preset: Preset;
  /** Remove the preset's skills instead of deploying them. */
  action?: "add" | "remove";
  /** Only these agents; otherwise every available agent whose switch is on. */
  agentKeys?: string[];
}

/**
 * Deploy the preset's skills to every available agent whose switch is on (or to `agentKeys`, still
 * by the switches), or take them out again. A one-time copy, logged in the activity history.
 */
export function useApplyPreset(): UseMutationResult<ApplyResult, unknown, ApplyPresetInput> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ preset, action = "add", agentKeys }: ApplyPresetInput) =>
      action === "add"
        ? api.presets.applyToDefault(preset.id, { agentKeys })
        : api.presets.removeFromDefault(preset.id, { agentKeys }),
    onSuccess: (result, { action = "add", agentKeys }) =>
      toastApplyResult(
        result,
        action,
        agentKeys ? reloadHintFor(queryClient, agentKeys) : reloadHintForAvailable(queryClient),
      ),
    error: false,
    onError: (error, { action = "add" }) =>
      toastError(error, action === "add" ? "presetPage.errors.apply" : "presetPage.errors.remove"),
  });
}

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
  { input: string; name?: string; reuseSameName?: string[] }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: async ({ input, name, reuseSameName }) => {
      try {
        return await api.presets.importFile(input, { name, reuseSameName });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNSAFE") throw error;
        if (!(await askToInstallFlagged(error.details))) return null;
        return api.presets.importFile(input, { name, reuseSameName, acceptRisk: true });
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
