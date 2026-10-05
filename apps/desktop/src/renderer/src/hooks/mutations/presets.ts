import type { Preset, PresetInput } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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

/** Delete a preset. Deployed skills stay where they are. */
export function useRemovePreset(): UseMutationResult<void, unknown, Preset> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (preset: Preset) => api.presets.remove(preset.id),
    success: (_result, preset) => t("presets.deleted", { name: preset.name }),
    error: "errors.deletePreset",
  });
}

/** Persist a new preset order; the cached list is reordered at once. */
export function useReorderPresets(): UseMutationResult<void, unknown, string[], CacheSnapshot> {
  return useReorderMutation<Preset>(
    keys.presets.all,
    (ids) => api.presets.reorder(ids),
    (preset) => preset.id,
  );
}
