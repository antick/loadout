import type { GitPreview } from "@loadout/shared";
import { type UseMutationResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { guessSource, hostOf } from "@/features/install/source-guess";
import { useInstallTask } from "@/features/install/use-install-task";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";

/** Progress title for fetching typed text, by what it probably is. */
const FETCH_TITLES = {
  repository: "install.toast.cloning",
  archive: "install.toast.downloading",
  file: "install.toast.downloadingFile",
  site: "install.toast.fetchingSite",
} as const;

/**
 * Fetch a repository, a site or a link, and list its skills. Cancellable. Silent on success: the
 * dialog opens.
 */
export function usePreviewGit(): (repoUrl: string) => Promise<GitPreview | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  return useCallback(
    (repoUrl) =>
      run({
        key: repoUrl,
        title: t(FETCH_TITLES[guessSource(repoUrl)], { host: hostOf(repoUrl) }),
        run: () => api.install.previewGit(repoUrl),
        cancel: () => api.install.cancel(repoUrl),
      }),
    [run, t],
  );
}

/**
 * List the skills of an archive on this computer. Quick and local, so no progress toast: the
 * caller shows a busy state, and a failure is toasted here.
 */
export function usePreviewArchive(): UseMutationResult<GitPreview, unknown, string> {
  return useApiMutation({
    fn: (archivePath: string) => api.install.previewArchive(archivePath),
    error: "install.errors.readArchive",
  });
}

/** Throw a preview's checkout away. Never fails loudly: there is nothing the user could do. */
export function useCancelPreview(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (previewId: string) => api.install.cancelPreview(previewId),
    error: false,
  });
}
