import type { AppUpdateStatus } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

/** The update actions all answer with the new status; keep the cached one in step. */
function useUpdateAction(
  action: () => Promise<AppUpdateStatus>,
  fallbackKey: string,
): UseMutationResult<AppUpdateStatus, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (status) => queryClient.setQueryData(keys.app.update, status),
    onError: (error) => toastError(error, fallbackKey),
  });
}

/** Look for a newer app version now. */
export function useCheckAppUpdate(): UseMutationResult<AppUpdateStatus, unknown, void> {
  return useUpdateAction(() => api.app.checkUpdate(), "settings.about.updateFailed");
}

/** Download and verify the newer version. Progress arrives through the status query. */
export function useDownloadAppUpdate(): UseMutationResult<AppUpdateStatus, unknown, void> {
  return useUpdateAction(() => api.app.downloadUpdate(), "appUpdate.downloadFailed");
}

export function useCancelAppUpdate(): UseMutationResult<AppUpdateStatus, unknown, void> {
  return useUpdateAction(() => api.app.cancelUpdate(), "appUpdate.downloadFailed");
}

/** Quit and install the downloaded version (or open the Linux package in the system installer). */
export function useInstallAppUpdate(): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: () => api.app.installUpdate(),
    onError: (error) => toastError(error, "appUpdate.installFailed"),
  });
}
