import type { Preset, PresetInput } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { sortByIds } from "@/lib/utils";

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
export function useReorderPresets(): UseMutationResult<
  void,
  unknown,
  string[],
  { previous?: Preset[] }
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: (ids: string[]) => api.presets.reorder(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.presets.all });
      const previous = queryClient.getQueryData<Preset[]>(keys.presets.all);
      if (previous) queryClient.setQueryData(keys.presets.all, sortByIds(previous, ids));
      return { previous };
    },
    error: "errors.reorder",
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(keys.presets.all, context.previous);
    },
  });
}
