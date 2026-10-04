import type { GithubConnectResult } from "@loadout/shared";
import { useTranslation } from "react-i18next";
import { useStartBackup } from "@/features/backup/backup-mutations";
import { toastSuccess } from "@/lib/toast";
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
 * After GitHub answered with a repository (a public one was agreed to already): say what was
 * found, then restore from it when it has content, or make this machine its first backup when it
 * is empty.
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
    startBackup.mutate(
      { url: result.url, mode: result.remoteHasContent ? "restore" : "new", isRepo },
      { onSuccess: onDone, onError: onFailure },
    );
  };

  return { finish, isPending: startBackup.isPending };
}
