import type { SettingKey, SettingValue, Settings } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

export interface SetSettingInput<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue<K>;
}

/** Save one setting. The cached settings flip at once and roll back if saving fails. */
export function useSetSetting(): UseMutationResult<
  void,
  unknown,
  SetSettingInput,
  { previous?: Settings }
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ key, value }: SetSettingInput) => api.settings.set(key, value),
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: keys.settings.all });
      const previous = queryClient.getQueryData<Settings>(keys.settings.all);
      if (previous)
        queryClient.setQueryData<Settings>(keys.settings.all, { ...previous, [key]: value });
      return { previous };
    },
    error: "errors.saveSetting",
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.settings.all, context.previous);
    },
  });
}
