import {
  type ClearableArea,
  formatBytes,
  type RemovedFolder,
  type RemoveAllDataOptions,
  type RestoreRemovedResult,
} from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Empty one clearable area and say how much was freed. */
export function useClearStorage(): UseMutationResult<number, unknown, ClearableArea> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (area: ClearableArea) => api.storage.clear(area),
    success: (freed, area) =>
      t("settings.storage.cleared", {
        area: t(`settings.storage.areas.${area}.title`),
        size: formatBytes(freed),
      }),
    error: "settings.storage.errors.clear",
    invalidate: [keys.storage.root],
  });
}

/** Empty the app's own Chromium caches. */
export function useClearAppCache(): UseMutationResult<void, unknown, void> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: () => api.app.clearAppCache(),
    success: () =>
      t("settings.storage.clearedApp", { area: t("settings.storage.areas.app.title") }),
    error: "settings.storage.errors.clear",
    invalidate: [keys.storage.root],
  });
}

/** Remove every file Loadout keeps; the app quits when it succeeds. */
export function useRemoveAllData(): UseMutationResult<void, unknown, RemoveAllDataOptions> {
  return useApiMutation({
    fn: (options: RemoveAllDataOptions) => api.app.removeAllData(options),
    error: "settings.storage.errors.removeAll",
  });
}

/** Put a Recently removed folder back where it came from. */
export function useRestoreRemoved(): UseMutationResult<
  RestoreRemovedResult,
  unknown,
  RemovedFolder
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (entry: RemovedFolder) => api.storage.restoreRemoved(entry.id),
    success: (result, entry) => ({
      message: t("settings.storage.removed.restored", { name: entry.name, place: entry.place }),
      description: result.displacedId ? t("settings.storage.removed.displacedNote") : undefined,
    }),
    error: "settings.storage.removed.errors.restore",
  });
}

/** Delete one Recently removed folder for good. */
export function useDeleteRemoved(): UseMutationResult<void, unknown, RemovedFolder> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (entry: RemovedFolder) => api.storage.deleteRemoved(entry.id),
    success: (_result, entry) => t("settings.storage.removed.deleted", { name: entry.name }),
    error: "settings.storage.removed.errors.delete",
    invalidate: [keys.storage.root],
  });
}

/** Show a Recently removed folder in the file manager. */
export function useRevealRemoved(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (id: string) => api.storage.revealRemoved(id),
    error: "errors.reveal",
  });
}
