import type { Preset, PresetInput } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useReorderMutation } from "@/hooks/use-reorder-mutation";
import { api } from "@/lib/api";
import type { CacheSnapshot } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";

export interface SavePresetInput {
  /** Omit to create a new preset. */
  id?: string;
  input: PresetInput;
}

/** Create a preset, or update it when `id` is given. */
export function useSavePreset(): UseMutationResult<Preset, unknown, SavePresetInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ id, input }: SavePresetInput) =>
      id ? api.presets.update(id, input) : api.presets.create(input),
    success: (preset, { id }) =>
      t(id ? "presets.updated" : "presets.created", { name: preset.name }),
    error: "errors.savePreset",
  });
}

/**
 * Ask, then delete a preset; deployed skills stay where they are. Leaves the preset's page once it
 * is gone, from wherever the delete was asked for.
 */
export function useRemovePreset(): { ask: (preset: Preset) => Promise<void>; isPending: boolean } {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { presetId } = useParams({ strict: false });
  const { mutate, isPending } = useApiMutation({
    fn: (preset: Preset) => api.presets.remove(preset.id),
    success: (_result, preset) => t("presets.deleted", { name: preset.name }),
    error: "errors.deletePreset",
  });
  const ask = useCallback(
    async (preset: Preset) => {
      const ok = await confirm({
        title: t("presets.deleteTitle", { name: preset.name }),
        description: t("presets.deleteDescription"),
        confirmLabel: t("common.delete"),
        destructive: true,
      });
      if (!ok) return;
      mutate(preset, {
        onSuccess: () => {
          if (presetId === preset.id) void navigate({ to: "/presets" });
        },
      });
    },
    [confirm, mutate, navigate, presetId, t],
  );
  return { ask, isPending };
}

/** Persist a new preset order; the cached list is reordered at once. */
export function useReorderPresets(): UseMutationResult<void, unknown, string[], CacheSnapshot> {
  return useReorderMutation<Preset>(
    keys.presets.all,
    (ids) => api.presets.reorder(ids),
    (preset) => preset.id,
  );
}
