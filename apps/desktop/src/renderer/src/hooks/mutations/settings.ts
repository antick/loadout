import type { SettingKey, SettingValue, Settings } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

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
  return useMutation({
    mutationFn: ({ key, value }: SetSettingInput) => api.settings.set(key, value),
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: keys.settings.all });
      const previous = queryClient.getQueryData<Settings>(keys.settings.all);
      if (previous)
        queryClient.setQueryData<Settings>(keys.settings.all, { ...previous, [key]: value });
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.settings.all, context.previous);
      toastError(error, "errors.saveSetting");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.settings.root }),
  });
}
