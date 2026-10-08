import type { GithubConnectResult } from "@loadout/shared";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useGithubConfirmPublic, useGithubDiscardPublic } from "@/features/backup/backup-mutations";
import { publicRepoDetails } from "@/features/backup/backup-errors";

export interface PublicRepoConfirm {
  /** Handles a connect error: true when it took the error over and asked the user. */
  handle(error: unknown): boolean;
  /** The agreed connect, or the forgetting of the token, is running. */
  pending: boolean;
}

/**
 * Connecting to a public GitHub repository stops before anything is saved. This asks the user,
 * then either finishes the connect or has the waiting token forgotten.
 */
export function usePublicRepoConfirm(
  onConnected: (result: GithubConnectResult) => void,
): PublicRepoConfirm {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const confirmPublic = useGithubConfirmPublic();
  const discardPublic = useGithubDiscardPublic();

  const handle = (error: unknown): boolean => {
    const details = publicRepoDetails(error);
    if (!details) return false;
    void (async () => {
      const agreed = await confirm({
        title: t("backupSync.publicRepo.title", { repo: details.repo }),
        description: t("backupSync.publicRepo.body"),
        confirmLabel: t("backupSync.publicRepo.confirm"),
        cancelLabel: t("backupSync.publicRepo.cancel"),
        destructive: true,
      });
      if (agreed) confirmPublic.mutate(details.confirmId, { onSuccess: onConnected });
      else discardPublic.mutate(details.confirmId);
    })();
    return true;
  };
  return { handle, pending: confirmPublic.isPending || discardPublic.isPending };
}
