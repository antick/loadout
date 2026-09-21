import type { ApplyResult, Preset, PresetAgentToggle } from "@loadout/shared";
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateDeployments } from "@/hooks/mutations/deploy";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastApplyResult, toastError, toastSuccess } from "@/lib/toast";

export interface PresetSkillsInput {
  preset: Preset;
  skillIds: string[];
  /** Skip the success toast, e.g. for a checkbox that already shows the new state. */
  silent?: boolean;
}

interface PresetListContext {
  previous?: Preset[];
}

/** Membership shows up on presets and on each skill's `presetIds`. */
function invalidateMembership(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: keys.presets.root });
  void queryClient.invalidateQueries({ queryKey: keys.skills.root });
}

/** Replace one preset's skill ids in the cached list before the backend answers. */
async function patchPresetSkills(
  queryClient: QueryClient,
  presetId: string,
  next: (skillIds: string[]) => string[],
): Promise<PresetListContext> {
  await queryClient.cancelQueries({ queryKey: keys.presets.all });
  const previous = queryClient.getQueryData<Preset[]>(keys.presets.all);
  if (!previous) return {};
  queryClient.setQueryData<Preset[]>(
    keys.presets.all,
    previous.map((preset) =>
      preset.id === presetId ? { ...preset, skillIds: next(preset.skillIds) } : preset,
    ),
  );
  return { previous };
}

/** Add skills to a preset. Nothing is deployed: a preset is only a named set. */
export function useAddSkillsToPreset(): UseMutationResult<void, unknown, PresetSkillsInput> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ preset, skillIds }: PresetSkillsInput) =>
      api.presets.addSkills(preset.id, skillIds),
    onSuccess: (_result, { preset, skillIds, silent }) => {
      if (silent) return;
      toastSuccess(t("presetPage.skillsAdded", { count: skillIds.length, name: preset.name }));
    },
    onError: (error) => toastError(error, "presetPage.errors.addSkills"),
    onSettled: () => invalidateMembership(queryClient),
  });
}

/** Take skills out of a preset. Deployed copies stay where they are. */
export function useRemoveSkillsFromPreset(): UseMutationResult<
  void,
  unknown,
  PresetSkillsInput,
  PresetListContext
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ preset, skillIds }: PresetSkillsInput) =>
      api.presets.removeSkills(preset.id, skillIds),
    onMutate: ({ preset, skillIds }) =>
      patchPresetSkills(queryClient, preset.id, (current) =>
        current.filter((id) => !skillIds.includes(id)),
      ),
    onSuccess: (_result, { preset, skillIds, silent }) => {
      if (silent) return;
      toastSuccess(t("presetPage.skillsRemoved", { count: skillIds.length, name: preset.name }));
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.presets.all, context.previous);
      toastError(error, "presetPage.errors.removeSkills");
    },
    onSettled: () => invalidateMembership(queryClient),
  });
}

/** Persist a new skill order inside a preset; the cached preset is reordered at once. */
export function useReorderPresetSkills(): UseMutationResult<
  void,
  unknown,
  { presetId: string; skillIds: string[] },
  PresetListContext
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ presetId, skillIds }) => api.presets.reorderSkills(presetId, skillIds),
    onMutate: ({ presetId, skillIds }) => patchPresetSkills(queryClient, presetId, () => skillIds),
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.presets.all, context.previous);
      toastError(error, "errors.reorder");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.presets.root }),
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
  { previous?: PresetAgentToggle[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ presetId, skillId, agentKey, enabled }: SetPresetToggleInput) =>
      api.presets.setToggle(presetId, skillId, agentKey, enabled),
    onMutate: async ({ presetId, skillId, agentKey, enabled }) => {
      const queryKey = keys.presets.toggles(presetId, skillId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PresetAgentToggle[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<PresetAgentToggle[]>(
          queryKey,
          previous.map((toggle) =>
            toggle.agentKey === agentKey ? { ...toggle, enabled } : toggle,
          ),
        );
      }
      return { previous };
    },
    onError: (error, { presetId, skillId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.presets.toggles(presetId, skillId), context.previous);
      }
      toastError(error, "presetPage.errors.toggle");
    },
    onSettled: (_result, _error, { presetId, skillId }) =>
      queryClient.invalidateQueries({ queryKey: keys.presets.toggles(presetId, skillId) }),
  });
}

/** Deploy the preset's skills to every available agent whose toggle is on. A one-time copy. */
export function useApplyPreset(): UseMutationResult<ApplyResult, unknown, Preset> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preset: Preset) => api.presets.applyToDefault(preset.id),
    onSuccess: (result) => toastApplyResult(result, "add"),
    onError: (error) => toastError(error, "presetPage.errors.apply"),
    onSettled: () => invalidateDeployments(queryClient),
  });
}
