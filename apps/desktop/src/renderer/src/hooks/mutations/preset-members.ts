import type { Preset } from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCached, restoreCached } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";
import { toastSuccess } from "@/lib/toast";

export interface PresetSkillsInput {
  preset: Preset;
  skillIds: string[];
  /** Skip the success toast, e.g. for a checkbox that already shows the new state. */
  silent?: boolean;
}

/** Replace one preset's skill ids in the cached list before the backend answers. */
export function patchPresetSkills(
  queryClient: QueryClient,
  presetId: string,
  next: (skillIds: string[]) => string[],
): Promise<CacheSnapshot> {
  return patchCached<Preset[]>(queryClient, keys.presets.all, (presets) =>
    presets.map((preset) =>
      preset.id === presetId ? { ...preset, skillIds: next(preset.skillIds) } : preset,
    ),
  );
}

/** Add skills to a preset. Nothing is deployed: a preset is only a named set. */
export function useAddSkillsToPreset(): UseMutationResult<void, unknown, PresetSkillsInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ preset, skillIds }: PresetSkillsInput) => api.presets.addSkills(preset.id, skillIds),
    onSuccess: (_result, { preset, skillIds, silent }) => {
      if (silent) return;
      toastSuccess(t("presetPage.skillsAdded", { count: skillIds.length, name: preset.name }));
    },
    error: "presetPage.errors.addSkills",
  });
}

/** Take skills out of a preset. Deployed copies stay where they are. */
export function useRemoveSkillsFromPreset(): UseMutationResult<
  void,
  unknown,
  PresetSkillsInput,
  CacheSnapshot
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ preset, skillIds }: PresetSkillsInput) => api.presets.removeSkills(preset.id, skillIds),
    onMutate: ({ preset, skillIds }) =>
      patchPresetSkills(queryClient, preset.id, (current) =>
        current.filter((id) => !skillIds.includes(id)),
      ),
    onSuccess: (_result, { preset, skillIds, silent }) => {
      if (silent) return;
      toastSuccess(t("presetPage.skillsRemoved", { count: skillIds.length, name: preset.name }));
    },
    error: "presetPage.errors.removeSkills",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}
