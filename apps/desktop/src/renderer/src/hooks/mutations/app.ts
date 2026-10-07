import { type EditorChoice, type FileTypeFilter, type RepairReport } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { type SuccessToast, useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { GENERIC_ERROR_KEY, toastSuccess } from "@/lib/toast";

/**
 * Copy text to the clipboard through the main process and confirm with a toast. `success`
 * replaces the plain "Copied" toast; null from it keeps quiet.
 */
export function useCopyText(
  success?: (text: string) => SuccessToast | null,
): UseMutationResult<void, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (text: string) => api.app.copyText(text),
    success: success ? (_data, text) => success(text) : () => t("common.copied"),
    error: "errors.copy",
  });
}

/** The native folder picker; resolves to null when the user cancels. */
export function usePickFolder(): UseMutationResult<string | null, unknown, string | undefined> {
  return useApiMutation({
    fn: (title?: string) => api.app.pickFolder(title),
    error: GENERIC_ERROR_KEY,
  });
}

export interface PickFileInput {
  filter: FileTypeFilter;
  title?: string;
}

/** The native file picker; resolves to null when the user cancels. */
export function usePickFile(): UseMutationResult<string | null, unknown, PickFileInput> {
  return useApiMutation({
    fn: ({ filter, title }: PickFileInput) => api.app.pickFile(filter, title),
    error: GENERIC_ERROR_KEY,
  });
}

/** Show a path in the OS file manager. */
export function useRevealPath(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (path: string) => api.app.revealPath(path),
    error: "errors.reveal",
  });
}

export interface OpenInEditorInput {
  editor: EditorChoice;
  path: string;
}

/** Open a file or folder in an editor found on this computer, or the system's default app. */
export function useOpenInEditor(): UseMutationResult<void, unknown, OpenInEditorInput> {
  return useApiMutation({
    fn: ({ editor, path }: OpenInEditorInput) => api.app.openInEditor(editor, path),
    error: "errors.openInEditor",
  });
}

/** Open a link in the default browser. */
export function useOpenExternal(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (url: string) => api.app.openExternal(url),
    error: "errors.openLink",
  });
}

/** Forget the crash recorded by the previous run. */
export function useClearLastCrash(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.system.clearLastCrash(),
    error: GENERIC_ERROR_KEY,
    invalidate: [keys.system.lastCrash],
  });
}

/** Run the deployment repair again, e.g. after moving a folder out of the way. */
export function useRepairDeployments(): UseMutationResult<RepairReport, unknown, void> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useApiMutation({
    fn: () => api.system.repairDeployments(),
    onSuccess: (report) => {
      queryClient.setQueryData(keys.system.repair, report);
      if (report.failed.length === 0) {
        toastSuccess(t("banners.repairDone", { count: report.repaired.length }));
      }
    },
    error: GENERIC_ERROR_KEY,
  });
}

/** Take the repair banner down until the next run. */
export function useDismissRepair(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.system.dismissRepair(),
    error: GENERIC_ERROR_KEY,
    invalidate: [keys.system.repair],
  });
}

export function useRestartApp(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.app.restart(),
    error: GENERIC_ERROR_KEY,
  });
}
