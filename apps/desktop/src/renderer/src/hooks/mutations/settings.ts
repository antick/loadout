import type { SettingKey, SettingValue, Settings } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCached, restoreCached } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";

export interface SetSettingInput<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue<K>;
}

/** Save one setting. The cached settings flip at once and roll back if saving fails. */
export function useSetSetting(): UseMutationResult<void, unknown, SetSettingInput, CacheSnapshot> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ key, value }: SetSettingInput) => api.settings.set(key, value),
    onMutate: ({ key, value }) =>
      patchCached<Settings>(queryClient, keys.settings.all, (settings) => ({
        ...settings,
        [key]: value,
      })),
    error: "errors.saveSetting",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}
