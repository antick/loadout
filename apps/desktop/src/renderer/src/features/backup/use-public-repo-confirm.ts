import type { GithubConnectResult } from "@loadout/shared";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useGithubConfirmPublic, useGithubDiscardPublic } from "@/features/backup/backup-mutations";
import { publicRepoDetails } from "@/lib/backup-errors";

/**
 * Connecting to a public GitHub repository stops before anything is saved. This asks the user,
 * then either finishes the connect or has the waiting token forgotten. Returns a handler for
 * connect errors: true when it took the error over.
 */
export function usePublicRepoConfirm(
  onConnected: (result: GithubConnectResult) => void,
): (error: unknown) => boolean {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const confirmPublic = useGithubConfirmPublic();
  const discardPublic = useGithubDiscardPublic();

  return (error) => {
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
}
