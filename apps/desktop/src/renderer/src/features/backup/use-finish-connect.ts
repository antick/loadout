import type { GithubConnectResult } from "@skillboard/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useStartBackup } from "@/hooks/mutations/backup-page";
import { toastSuccess } from "@/lib/toast";
import { PUBLIC_REPO_WARNING_MS } from "./constants";
import { remoteWebUrl } from "./remote-url";

export interface FinishConnectOptions {
  isRepo: boolean;
  onDone: () => void;
  onFailure: (error: unknown) => void;
}

export interface FinishConnect {
  finish(result: GithubConnectResult): void;
  isPending: boolean;
}

/**
 * After GitHub answered with a repository: say what was found, warn about a public one, then
 * restore from it when it has content, or make this machine its first backup when it is empty.
 */
export function useFinishConnect({
  isRepo,
  onDone,
  onFailure,
}: FinishConnectOptions): FinishConnect {
  const { t } = useTranslation();
  const startBackup = useStartBackup();

  const finish = (result: GithubConnectResult): void => {
    const repo = remoteWebUrl(result.url)?.replace(/^https:\/\//, "") ?? result.url;
    toastSuccess(
      t(result.repoCreated ? "backupPage.github.repoCreated" : "backupPage.github.repoFound", {
        repo,
      }),
      t("backupPage.github.connectedAs", { login: result.login }),
    );
    if (!result.repoPrivate) {
      toast.warning(t("backupPage.github.publicRepoTitle"), {
        description: t("backupPage.github.publicRepoBody"),
        duration: PUBLIC_REPO_WARNING_MS,
      });
    }
    startBackup.mutate(
      { url: result.url, mode: result.remoteHasContent ? "restore" : "new", isRepo },
      { onSuccess: onDone, onError: onFailure },
    );
  };

  return { finish, isPending: startBackup.isPending };
}
