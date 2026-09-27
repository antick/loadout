import {
  type ClearableArea,
  formatBytes,
  type RemovedFolder,
  type RemoveAllDataOptions,
  type RestoreRemovedResult,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { invalidateAfterRestore } from "@/lib/removed-undo";
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

/** Put a Recently removed folder back where it came from. */
export function useRestoreRemoved(): UseMutationResult<
  RestoreRemovedResult,
  unknown,
  RemovedFolder
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (entry: RemovedFolder) => api.storage.restoreRemoved(entry.id),
    onSuccess: (result, entry) =>
      toastSuccess(
        t("settings.storage.removed.restored", { name: entry.name, place: entry.place }),
        result.displacedId ? t("settings.storage.removed.displacedNote") : undefined,
      ),
    onError: (error) => toastError(error, "settings.storage.removed.errors.restore"),
    onSettled: () => invalidateAfterRestore(queryClient),
  });
}

/** Delete one Recently removed folder for good. */
export function useDeleteRemoved(): UseMutationResult<void, unknown, RemovedFolder> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (entry: RemovedFolder) => api.storage.deleteRemoved(entry.id),
    onSuccess: (_result, entry) =>
      toastSuccess(t("settings.storage.removed.deleted", { name: entry.name })),
    onError: (error) => toastError(error, "settings.storage.removed.errors.delete"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.storage.root }),
  });
}

/** Show a Recently removed folder in the file manager. */
export function useRevealRemoved(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (id: string) => api.storage.revealRemoved(id),
    onError: (error) => toastError(error, "errors.reveal"),
  });
}
