import { type ClearableArea, formatBytes, type RemoveAllDataOptions } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Empty one clearable area and say how much was freed. */
export function useClearStorage(): UseMutationResult<number, unknown, ClearableArea> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (area: ClearableArea) => api.storage.clear(area),
    onSuccess: (freed, area) =>
      toastSuccess(
        t("settings.storage.cleared", {
          area: t(`settings.storage.areas.${area}.title`),
          size: formatBytes(freed),
        }),
      ),
    onError: (error) => toastError(error, "settings.storage.errors.clear"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.storage.root }),
  });
}

/** Empty the app's own Chromium caches. */
export function useClearAppCache(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.app.clearAppCache(),
    onSuccess: () =>
      toastSuccess(
        t("settings.storage.clearedApp", { area: t("settings.storage.areas.app.title") }),
      ),
    onError: (error) => toastError(error, "settings.storage.errors.clear"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.storage.root }),
  });
}

/** Remove every file Loadout keeps; the app quits when it succeeds. */
export function useRemoveAllData(): UseMutationResult<void, unknown, RemoveAllDataOptions> {
  return useMutation({
    mutationFn: (options: RemoveAllDataOptions) => api.app.removeAllData(options),
    onError: (error) => toastError(error, "settings.storage.errors.removeAll"),
  });
}
