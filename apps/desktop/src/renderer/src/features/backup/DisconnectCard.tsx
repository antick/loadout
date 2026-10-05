import type { GithubAuthMethod } from "@loadout/shared";
import { Unplug } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { useRemoveBackupRemote } from "@/features/backup/backup-mutations";
import { useGithubAuthMethod } from "@/features/backup/backup-queries";
import { useOpenExternal } from "@/hooks/mutations/app";
import { GITHUB_AUTHORIZED_APPS_URL, GITHUB_TOKENS_URL, REPO_DANGER_ZONE_PATH } from "./constants";
import { isGithubRemote, remoteWebUrl } from "./remote-url";

/** GitHub pages where the access this app was given can be taken back. */
function revokePages(method: GithubAuthMethod | undefined): string[] {
  if (method === "pat") return [GITHUB_TOKENS_URL];
  if (method === "oauth") return [GITHUB_AUTHORIZED_APPS_URL];
  return [GITHUB_TOKENS_URL, GITHUB_AUTHORIZED_APPS_URL];
}

function TextLink({ label, onClick }: { label: string; onClick: () => void }): ReactNode {
  return (
    <Button size="xs" variant="link" className="h-auto px-0" onClick={onClick}>
      {label}
    </Button>
  );
}

/** Stop backing up here; on GitHub, links to take the access back or delete the repository. */
export function DisconnectCard({
  remoteUrl,
  onDisconnected,
}: {
  remoteUrl: string;
  onDisconnected: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const openExternal = useOpenExternal();
  const removeRemote = useRemoveBackupRemote();
  const authMethod = useGithubAuthMethod();
  const webUrl = isGithubRemote(remoteUrl) ? remoteWebUrl(remoteUrl) : null;

  const disconnect = async (): Promise<void> => {
    const confirmed = await confirm({
      title: t("backupPage.disconnect.confirmTitle"),
      description: t("backupPage.disconnect.confirmBody"),
      items: [remoteUrl],
      confirmLabel: t("backupPage.disconnect.action"),
      destructive: true,
    });
    if (confirmed) removeRemote.mutate(undefined, { onSuccess: onDisconnected });
  };

  return (
    <Panel
      title={t("backupPage.disconnect.title")}
      description={t("backupPage.disconnect.body")}
      tone="danger"
    >
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={removeRemote.isPending}
          onClick={() => void disconnect()}
        >
          <Unplug />
          {t("backupPage.disconnect.action")}
        </Button>
      </div>
      {webUrl ? (
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          {t("backupPage.disconnect.onGithub")}
          <TextLink
            label={t("backupPage.disconnect.revoke")}
            onClick={() => {
              for (const page of revokePages(authMethod.data)) openExternal.mutate(page);
            }}
          />
          {t("backupPage.disconnect.or")}
          <TextLink
            label={t("backupPage.disconnect.deleteRepo")}
            onClick={() => openExternal.mutate(`${webUrl}${REPO_DANGER_ZONE_PATH}`)}
          />
        </p>
      ) : null}
    </Panel>
  );
}
