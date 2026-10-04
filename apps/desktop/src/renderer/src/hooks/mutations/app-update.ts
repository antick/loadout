import type { AppUpdateStatus } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** The update actions all answer with the new status; keep the cached one in step. */
export function useUpdateAction(
  action: () => Promise<AppUpdateStatus>,
  fallbackKey: string,
): UseMutationResult<AppUpdateStatus, unknown, void> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: action,
    onSuccess: (status) => queryClient.setQueryData(keys.app.update, status),
    error: fallbackKey,
  });
}

/** Download and verify the newer version. Progress arrives through the status query. */
export function useDownloadAppUpdate(): UseMutationResult<AppUpdateStatus, unknown, void> {
  return useUpdateAction(() => api.app.downloadUpdate(), "appUpdate.downloadFailed");
}

/** Quit and install the downloaded version (or open the Linux package in the system installer). */
export function useInstallAppUpdate(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.app.installUpdate(),
    error: "appUpdate.installFailed",
  });
}
