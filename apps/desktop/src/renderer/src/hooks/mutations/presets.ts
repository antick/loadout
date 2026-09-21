import type { Preset, PresetInput } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";
import { sortByIds } from "@/lib/utils";

export interface SavePresetInput {
  /** Omit to create a new preset. */
  id?: string;
  input: PresetInput;
}

/** Create a preset, or update it when `id` is given. */
export function useSavePreset(): UseMutationResult<Preset, unknown, SavePresetInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, input }: SavePresetInput) =>
      id ? api.presets.update(id, input) : api.presets.create(input),
    onSuccess: (preset, { id }) =>
      toastSuccess(t(id ? "presets.updated" : "presets.created", { name: preset.name })),
    onError: (error) => toastError(error, "errors.savePreset"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.presets.root }),
  });
}

/** Delete a preset. Deployed skills stay where they are. */
export function useRemovePreset(): UseMutationResult<void, unknown, Preset> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (preset: Preset) => api.presets.remove(preset.id),
    onSuccess: (_result, preset) => toastSuccess(t("presets.deleted", { name: preset.name })),
    onError: (error) => toastError(error, "errors.deletePreset"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.presets.root });
      void queryClient.invalidateQueries({ queryKey: keys.skills.root });
    },
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
  return useMutation({
    mutationFn: (ids: string[]) => api.presets.reorder(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.presets.all });
      const previous = queryClient.getQueryData<Preset[]>(keys.presets.all);
      if (previous) queryClient.setQueryData(keys.presets.all, sortByIds(previous, ids));
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(keys.presets.all, context.previous);
      toastError(error, "errors.reorder");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.presets.root }),
  });
}
