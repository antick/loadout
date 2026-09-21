import type { GithubAuthMethod } from "@loadout/shared";
import { ExternalLink, ShieldOff, Trash2, Unplug } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useRemoveBackupRemote } from "@/hooks/mutations/backup-page";
import { useGithubAuthMethod } from "@/hooks/queries/backup-page";
import { useSetting } from "@/hooks/queries/settings";
import {
  GITHUB_AUTHORIZED_APPS_URL,
  GITHUB_TOKENS_URL,
  githubOauthAppUrl,
  REPO_DANGER_ZONE_PATH,
} from "./constants";
import { isGithubRemote, remoteWebUrl } from "./remote-url";

/** GitHub pages where the access this app was given can be taken back. */
function revokePages(method: GithubAuthMethod | undefined, clientId: string): string[] {
  const oauthPage = clientId ? githubOauthAppUrl(clientId) : GITHUB_AUTHORIZED_APPS_URL;
  if (method === "pat") return [GITHUB_TOKENS_URL];
  if (method === "oauth") return [oauthPage];
  return [GITHUB_TOKENS_URL, oauthPage];
}

function Level({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Three ways to stop backing up, from "just this machine" to deleting the remote by hand. */
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
  const clientId = useSetting("githubClientId").trim();
  const onGithub = isGithubRemote(remoteUrl);
  const webUrl = remoteWebUrl(remoteUrl);

  const disconnect = async (): Promise<void> => {
    const confirmed = await confirm({
      title: t("backupPage.disconnect.machine.confirmTitle"),
      description: t("backupPage.disconnect.machine.confirmBody"),
      items: [remoteUrl],
      confirmLabel: t("backupPage.disconnect.machine.action"),
      destructive: true,
    });
    if (confirmed) removeRemote.mutate(undefined, { onSuccess: onDisconnected });
  };

  const revoke = async (): Promise<void> => {
    const confirmed = await confirm({
      title: t("backupPage.disconnect.revoke.confirmTitle"),
      description: t("backupPage.disconnect.revoke.confirmBody"),
      confirmLabel: t("backupPage.disconnect.revoke.action"),
      destructive: true,
    });
    if (!confirmed) return;
    for (const page of revokePages(authMethod.data, clientId)) openExternal.mutate(page);
    removeRemote.mutate(undefined, { onSuccess: onDisconnected });
  };

  return (
    <Panel title={t("backupPage.disconnect.title")} tone="danger">
      <div className="flex flex-col divide-y">
        <Level
          title={t("backupPage.disconnect.machine.title")}
          body={t("backupPage.disconnect.machine.body")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={removeRemote.isPending}
            onClick={() => void disconnect()}
          >
            <Unplug />
            {t("backupPage.disconnect.machine.action")}
          </Button>
        </Level>
        {onGithub ? (
          <Level
            title={t("backupPage.disconnect.revoke.title")}
            body={t("backupPage.disconnect.revoke.body")}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={removeRemote.isPending}
              onClick={() => void revoke()}
            >
              <ShieldOff />
              {t("backupPage.disconnect.revoke.action")}
            </Button>
          </Level>
        ) : null}
        <Level
          title={t("backupPage.disconnect.remote.title")}
          body={t(
            onGithub
              ? "backupPage.disconnect.remote.body"
              : "backupPage.disconnect.remote.bodyOther",
          )}
        >
          {onGithub && webUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => openExternal.mutate(`${webUrl}${REPO_DANGER_ZONE_PATH}`)}
            >
              <Trash2 />
              {t("backupPage.disconnect.remote.action")}
              <ExternalLink className="size-3" />
            </Button>
          ) : null}
        </Level>
      </div>
    </Panel>
  );
}
