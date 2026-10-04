import type { ApplyResult, Preset, PresetAgentToggle } from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { reloadHintForAvailable } from "@/lib/agent-reload";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastApplyResult, toastSuccess } from "@/lib/toast";
import { type CacheSnapshot, patchCached, restoreCached } from "@/lib/optimistic";

export interface PresetSkillsInput {
  preset: Preset;
  skillIds: string[];
  /** Skip the success toast, e.g. for a checkbox that already shows the new state. */
  silent?: boolean;
}

/** Replace one preset's skill ids in the cached list before the backend answers. */
function patchPresetSkills(
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

/** Deploy the preset's skills to every available agent whose toggle is on. A one-time copy. */
export function useApplyPreset(): UseMutationResult<ApplyResult, unknown, Preset> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: (preset: Preset) => api.presets.applyToDefault(preset.id),
    onSuccess: (result) => toastApplyResult(result, "add", reloadHintForAvailable(queryClient)),
    error: "presetPage.errors.apply",
  });
}
