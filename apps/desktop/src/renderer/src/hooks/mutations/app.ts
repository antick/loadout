import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Copy text to the clipboard through the main process and confirm with a toast. */
export function useCopyText(): UseMutationResult<void, unknown, string> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (text: string) => api.app.copyText(text),
    onSuccess: () => toastSuccess(t("common.copied")),
    onError: (error) => toastError(error, "errors.copy"),
  });
}

/** Show a path in the OS file manager. */
export function useRevealPath(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (path: string) => api.app.revealPath(path),
    onError: (error) => toastError(error, "errors.reveal"),
  });
}

/** Open a link in the default browser. */
export function useOpenExternal(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (url: string) => api.app.openExternal(url),
    onError: (error) => toastError(error, "errors.openLink"),
  });
}

/** Answer the close-or-minimise prompt. */
export function useResolveClose(): UseMutationResult<
  void,
  unknown,
  { action: "hide" | "quit"; remember: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, remember }) => api.app.resolveClose(action, remember),
    onError: (error) => toastError(error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.settings.root }),
  });
}

/** Forget the crash recorded by the previous run. */
export function useClearLastCrash(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.system.clearLastCrash(),
    onError: (error) => toastError(error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.system.lastCrash }),
  });
}

/** Start a backup sync now (used by the command palette). */
export function useBackupNow(): UseMutationResult<unknown, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.backup.sync(),
    onSuccess: () => toastSuccess(t("backup.synced")),
    onError: (error) => toastError(error, "errors.backup"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.backup.root }),
  });
}
