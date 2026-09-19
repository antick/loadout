import { DEFAULT_BACKUP_REPO_NAME, type GithubConnectResult } from "@skillboard/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLink, KeyRound } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useGithubConnect } from "@/hooks/mutations/backup-page";
import { useGithubDeviceAvailable } from "@/hooks/queries/backup-page";
import { GITHUB_NEW_TOKEN_URL, REPO_NAME_PATTERN } from "./constants";
import { DeviceSignIn } from "./DeviceSignIn";
import { useDeviceFlow } from "./use-device-flow";

export interface GithubConnectPanelProps {
  /** True while the remote is being wired up after GitHub answered. */
  finishing: boolean;
  /** Shown instead of the default title when re-authorising an existing remote. */
  reconnecting: boolean;
  onConnected: (result: GithubConnectResult) => void;
  onCancelReconnect?: () => void;
}

/** Connect the backup to a private GitHub repository, by sign-in or with an access token. */
export function GithubConnectPanel({
  finishing,
  reconnecting,
  onConnected,
  onCancelReconnect,
}: GithubConnectPanelProps): ReactNode {
  const { t } = useTranslation();
  const repoId = useId();
  const tokenId = useId();
  const [repoName, setRepoName] = useState(DEFAULT_BACKUP_REPO_NAME);
  const [token, setToken] = useState("");
  const deviceAvailable = useGithubDeviceAvailable();
  const connect = useGithubConnect();
  const openExternal = useOpenExternal();
  const flow = useDeviceFlow(onConnected);

  const name = repoName.trim();
  const nameValid = REPO_NAME_PATTERN.test(name) && name !== "." && name !== "..";
  const busy = finishing || connect.isPending;

  const submitToken = (event: FormEvent): void => {
    event.preventDefault();
    const secret = token.trim();
    if (!secret || !nameValid) return;
    // The token leaves this component's memory before the request is even answered.
    setToken("");
    connect.mutate({ token: secret, repoName: name }, { onSuccess: onConnected });
  };

  return (
    <Panel
      title={t(reconnecting ? "backupPage.github.reconnectTitle" : "backupPage.github.title")}
      description={t(
        reconnecting ? "backupPage.github.reconnectDescription" : "backupPage.github.description",
      )}
      actions={
        reconnecting && onCancelReconnect ? (
          <Button variant="ghost" size="sm" onClick={onCancelReconnect}>
            {t("common.cancel")}
          </Button>
        ) : null
      }
    >
      <Field data-invalid={!nameValid || undefined}>
        <FieldLabel htmlFor={repoId}>{t("backupPage.github.repoName")}</FieldLabel>
        <Input
          id={repoId}
          value={repoName}
          spellCheck={false}
          aria-invalid={!nameValid}
          className="max-w-sm font-mono text-sm"
          disabled={busy || flow.phase === "waiting"}
          onChange={(event) => setRepoName(event.target.value)}
        />
        {nameValid ? (
          <FieldDescription>{t("backupPage.github.repoNameHint")}</FieldDescription>
        ) : (
          <FieldError>{t("backupPage.github.repoNameInvalid")}</FieldError>
        )}
      </Field>

      {deviceAvailable.data ? (
        <>
          <DeviceSignIn
            flow={flow}
            disabled={busy || !nameValid}
            onBegin={() => void flow.begin(name)}
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("backupPage.github.orToken")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={submitToken} className="flex flex-col gap-2">
        <Field>
          <FieldLabel htmlFor={tokenId}>{t("backupPage.github.token")}</FieldLabel>
          <div className="flex max-w-xl gap-2">
            <Input
              id={tokenId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              placeholder={t("backupPage.github.tokenPlaceholder")}
              className="font-mono text-sm"
              disabled={busy || flow.phase === "waiting"}
              onChange={(event) => setToken(event.target.value)}
            />
            <Button
              type="submit"
              size="default"
              variant={deviceAvailable.data ? "outline" : "default"}
              disabled={busy || !token.trim() || !nameValid || flow.phase === "waiting"}
            >
              {busy ? <Spinner /> : <KeyRound />}
              {t("backupPage.github.connect")}
            </Button>
          </div>
          <FieldDescription>
            {t("backupPage.github.tokenHint")}{" "}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => openExternal.mutate(GITHUB_NEW_TOKEN_URL)}
            >
              {t("backupPage.github.createToken")}
              <ExternalLink className="size-3" />
            </button>
          </FieldDescription>
        </Field>
      </form>

      {deviceAvailable.data === false ? (
        <p className="text-xs text-muted-foreground">
          {t("backupPage.github.signInUnavailable")}{" "}
          <Link
            to="/settings"
            search={{ section: "backup" }}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("backupPage.github.openSettings")}
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}
