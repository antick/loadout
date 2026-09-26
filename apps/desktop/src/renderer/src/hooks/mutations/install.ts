import type {
  BatchImportResult,
  ConfirmOptions,
  DiscoveredSkill,
  GitPreview,
  InstallSelection,
  MarketSkill,
  ScanResult,
  Skill,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { InstallTaskSuccess } from "@/features/install/install-tasks";
import { guessSource, hostOf } from "@/features/install/source-guess";
import { useInstallTask } from "@/features/install/use-install-task";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

/** Task key of "import everything the scan found"; the backend reports no progress for it. */
export const IMPORT_ALL_DISCOVERED_KEY = "scan:import-all";

/** Progress and cancel key of a marketplace install: `owner/repo/skill`, as the backend names it. */
export function marketTaskKey(skill: Pick<MarketSkill, "source" | "skillId">): string {
  return `${skill.source}/${skill.skillId}`;
}

/** Task key of importing one discovered skill: the folder it is copied from. */
export function discoveredTaskKey(skill: DiscoveredSkill): string {
  return skill.locations[0]?.path ?? skill.fingerprint;
}

type Translate = ReturnType<typeof useTranslation>["t"];

function installedOne(t: Translate, skill: Skill): InstallTaskSuccess {
  return { message: t("install.toast.installed", { name: skill.name }), skills: [skill] };
}

function batchSummary(t: Translate, result: BatchImportResult): InstallTaskSuccess {
  const details = [
    ...(result.skipped > 0 ? [t("install.batch.skipped", { count: result.skipped })] : []),
    ...(result.errors.length > 0
      ? [t("install.batch.failed", { count: result.errors.length })]
      : []),
  ];
  return {
    message: t("install.toast.imported", { count: result.imported }),
    description: details.join(" · ") || undefined,
    tone: result.errors.length > 0 ? "warning" : "success",
    viewLibrary: result.imported > 0,
  };
}

/** Install one marketplace skill. Cancellable; installing again refreshes the library copy. */
export function useInstallFromMarket(): (skill: MarketSkill) => Promise<Skill | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  return useCallback(
    (skill) => {
      const key = marketTaskKey(skill);
      return run({
        key,
        title: t("install.toast.installing", { name: skill.name }),
        run: () => api.install.fromMarket(skill.source, skill.skillId),
        runAcceptingRisk: () =>
          api.install.fromMarket(skill.source, skill.skillId, { acceptRisk: true }),
        cancel: () => api.install.cancel(key),
        success: (installed) => installedOne(t, installed),
      });
    },
    [run, t],
  );
}

/** Install a skill folder or an archive, optionally under another name. */
export function useInstallFromPath(): (path: string, name?: string) => Promise<Skill | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  return useCallback(
    (path, name) =>
      run({
        key: path,
        title: t("install.toast.installingPath"),
        run: () => api.install.fromPath(path, name?.trim() || undefined),
        runAcceptingRisk: () =>
          api.install.fromPath(path, name?.trim() || undefined, { acceptRisk: true }),
        success: (installed) => installedOne(t, installed),
      }),
    [run, t],
  );
}

/** Import every skill folder directly inside a folder; progress arrives as "3/12: name". */
export function useImportFolder(): (folder: string) => Promise<BatchImportResult | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  return useCallback(
    (folder) =>
      run({
        key: folder,
        title: t("install.toast.importingFolder"),
        run: () => api.install.importFolder(folder),
        success: (result) => batchSummary(t, result),
      }),
    [run, t],
  );
}

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
  return useMutation({
    mutationFn: (archivePath: string) => api.install.previewArchive(archivePath),
    onError: (error) => toastError(error, "install.errors.readArchive"),
  });
}

/** Install the ticked skills of a preview under the names the user gave them. */
export function useConfirmGit(): (
  preview: GitPreview,
  items: InstallSelection[],
  options?: ConfirmOptions,
) => Promise<Skill[] | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  return useCallback(
    async (preview, items, options) => {
      const installed = await run({
        key: preview.repoUrl,
        title: t("install.toast.installingCount", { count: items.length }),
        run: () => api.install.confirmGit(preview.previewId, items, options),
        runAcceptingRisk: () =>
          api.install.confirmGit(preview.previewId, items, { ...options, acceptRisk: true }),
        success: (skills) => {
          const [only] = skills;
          const summary =
            only && skills.length === 1
              ? installedOne(t, only)
              : {
                  message: t("install.toast.installedCount", { count: skills.length }),
                  skills,
                };
          const deployTo = preview.allAgents ? "all" : preview.agents;
          return deployTo.length > 0 ? { ...summary, deployTo } : summary;
        },
      });
      // Declining a flagged install leaves the checkout waiting; nothing will confirm it now.
      // Cancelling a preview that was already used up does nothing.
      if (!installed) void api.install.cancelPreview(preview.previewId).catch(() => undefined);
      return installed;
    },
    [run, t],
  );
}

/** Native file picker limited to `.zip` and `.skill`. Resolves to null when the user cancels. */
export function usePickArchive(): UseMutationResult<string | null, unknown, void> {
  return useMutation({
    mutationFn: () => api.app.pickArchive(),
    onError: (error) => toastError(error),
  });
}

/** Throw a preview's checkout away. Never fails loudly: there is nothing the user could do. */
export function useCancelPreview(): UseMutationResult<void, unknown, string> {
  return useMutation({ mutationFn: (previewId: string) => api.install.cancelPreview(previewId) });
}

/** Copy one discovered skill into the library. The agent's own folder is left as it is. */
export function useImportDiscovered(): (
  skill: DiscoveredSkill,
  name?: string,
) => Promise<Skill | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  const queryClient = useQueryClient();
  return useCallback(
    async (skill, name) => {
      const path = skill.locations[0]?.path;
      if (!path) return null;
      const imported = await run({
        key: discoveredTaskKey(skill),
        title: t("install.toast.importing", { name: name?.trim() || skill.name }),
        run: () => api.install.importDiscovered(path, name?.trim() || undefined),
        runAcceptingRisk: () =>
          api.install.importDiscovered(path, name?.trim() || undefined, { acceptRisk: true }),
        success: (installed) => installedOne(t, installed),
      });
      if (imported) {
        // `data:changed` does not cover the scan result. Mark the group right away so the row
        // cannot be imported twice while the rescan runs.
        queryClient.setQueryData<ScanResult>(keys.install.scan, (previous) =>
          previous
            ? {
                ...previous,
                skills: previous.skills.map((entry) =>
                  entry.name === skill.name && entry.fingerprint === skill.fingerprint
                    ? { ...entry, imported: true }
                    : entry,
                ),
              }
            : previous,
        );
        void queryClient.invalidateQueries({ queryKey: keys.install.scan });
      }
      return imported;
    },
    [run, t, queryClient],
  );
}

/** Import every discovered skill that is not in the library yet. */
export function useImportAllDiscovered(): () => Promise<BatchImportResult | null> {
  const { t } = useTranslation();
  const { run } = useInstallTask();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const result = await run({
      key: IMPORT_ALL_DISCOVERED_KEY,
      title: t("install.toast.importingAll"),
      run: () => api.install.importAllDiscovered(),
      success: (summary) => batchSummary(t, summary),
    });
    if (result) void queryClient.invalidateQueries({ queryKey: keys.install.scan });
    return result;
  }, [run, t, queryClient]);
}
