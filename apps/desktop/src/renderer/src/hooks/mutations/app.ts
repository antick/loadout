import type { EditorChoice, RepairReport } from "@loadout/shared";
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

/** The native folder picker; resolves to null when the user cancels. */
export function usePickFolder(): UseMutationResult<string | null, unknown, string | undefined> {
  return useMutation({
    mutationFn: (title?: string) => api.app.pickFolder(title),
    onError: (error) => toastError(error),
  });
}

/** Show a path in the OS file manager. */
export function useRevealPath(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (path: string) => api.app.revealPath(path),
    onError: (error) => toastError(error, "errors.reveal"),
  });
}

export interface OpenInEditorInput {
  editor: EditorChoice;
  path: string;
}

/** Open a file or folder in an editor found on this computer, or the system's default app. */
export function useOpenInEditor(): UseMutationResult<void, unknown, OpenInEditorInput> {
  return useMutation({
    mutationFn: ({ editor, path }: OpenInEditorInput) => api.app.openInEditor(editor, path),
    onError: (error) => toastError(error, "errors.openInEditor"),
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

/** Run the deployment repair again, e.g. after moving a folder out of the way. */
export function useRepairDeployments(): UseMutationResult<RepairReport, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => api.system.repairDeployments(),
    onSuccess: (report) => {
      queryClient.setQueryData(keys.system.repair, report);
      if (report.failed.length === 0) {
        toastSuccess(t("banners.repairDone", { count: report.repaired.length }));
      }
    },
    onError: (error) => toastError(error),
  });
}

/** Take the repair banner down until the next run. */
export function useDismissRepair(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.system.dismissRepair(),
    onError: (error) => toastError(error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.system.repair }),
  });
}
