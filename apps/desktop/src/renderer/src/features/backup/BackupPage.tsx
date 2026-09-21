import { CircleArrowUp } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { InlineNotice } from "@/components/InlineNotice";
import { PageHeader } from "@/components/layout/PageHeader";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useFetchBackup, useSetDeviceName, useSyncBackup } from "@/hooks/mutations/backup-page";
import { useBackupStatus } from "@/hooks/queries/app";
import {
  useBackupConflicts,
  useBackupDeviceName,
  useBackupSnapshots,
} from "@/hooks/queries/backup-page";
import { useSkills } from "@/hooks/queries/skills";
import { backupErrorText, isAuthError, isRecoverableError } from "@/lib/backup-errors";
import { useAppEvent } from "@/lib/events";
import { AutoBackupCard } from "./AutoBackupCard";
import { BackupContents } from "./BackupContents";
import { deriveBackupMode } from "@/lib/backup-mode";
import { BackupSummary } from "./BackupSummary";
import { ConflictList } from "./ConflictList";
import { GIT_DOWNLOAD_URL } from "./constants";
import { DisconnectCard } from "./DisconnectCard";
import { GithubConnectPanel } from "./GithubConnectPanel";
import { RecoveryDialog } from "./RecoveryDialog";
import { isGithubRemote } from "./remote-url";
import { RemoteUrlPanel } from "./RemoteUrlPanel";
import { SetupDialog } from "./SetupDialog";
import { SnapshotHistory } from "./SnapshotHistory";
import { StatusCard } from "./StatusCard";
import { useFinishConnect } from "./use-finish-connect";

/** Back the library up to a Git remote, review what needs attention, and go back in time. */
export function BackupPage(): ReactNode {
  const { t } = useTranslation();
  const status = useBackupStatus();
  const conflicts = useBackupConflicts();
  const deviceName = useBackupDeviceName();
  const skills = useSkills();
  const sync = useSyncBackup();
  const fetchRemote = useFetchBackup();
  const renameDevice = useSetDeviceName();
  const openExternal = useOpenExternal();

  const [lastError, setLastError] = useState<unknown>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // A URL saved a moment ago, until the refreshed status reports it itself.
  const [savedRemote, setSavedRemote] = useState<string | null>(null);
  // Bumped on disconnect so the remote form starts empty again instead of showing the old URL.
  const [remoteFormKey, setRemoteFormKey] = useState(0);
  const connectPanel = useRef<HTMLDivElement>(null);

  const data = status.data;
  const isRepo = data?.isRepo ?? false;
  const remoteUrl = data?.remoteUrl ?? null;
  const mode = deriveBackupMode(data, savedRemote, lastError);
  const snapshots = useBackupSnapshots(isRepo && (data?.gitAvailable ?? false));

  const succeeded = (): void => {
    setLastError(null);
    setReconnecting(false);
  };
  const failed = (error: unknown): void => {
    setLastError(error);
    if (isRecoverableError(error)) setRecoveryOpen(true);
  };
  const connect = useFinishConnect({ isRepo, onDone: succeeded, onFailure: failed });

  // Ask the remote once per visit, so "changes on another device" is current.
  const canFetch = isRepo && remoteUrl !== null && (data?.gitAvailable ?? false);
  const { mutate: fetchOnce } = fetchRemote;
  useEffect(() => {
    if (canFetch) fetchOnce();
  }, [canFetch, fetchOnce]);

  useAppEvent("backup:auto-completed", (event) => {
    if (event.ok) setLastError(null);
    void status.refetch();
  });

  const primary = (): void => {
    switch (mode.kind) {
      case "git_missing":
        openExternal.mutate(GIT_DOWNLOAD_URL);
        return;
      case "not_set_up":
      case "needs_remote":
        if (mode.savedRemote && !isRepo) setSetupUrl(mode.savedRemote);
        else connectPanel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      case "needs_fix":
        setRecoveryOpen(true);
        return;
      case "failed":
        if (isRecoverableError(lastError)) setRecoveryOpen(true);
        else sync.mutate(undefined, { onSuccess: succeeded, onError: failed });
        return;
      case "pending":
      case "up_to_date":
        sync.mutate(undefined, { onSuccess: succeeded, onError: failed });
        return;
      case "loading":
        return;
    }
  };

  if (status.isError) {
    return (
      <>
        <PageHeader title={t("nav.backup")} />
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      </>
    );
  }

  const gitReady = data?.gitAvailable ?? false;
  const showConnect = gitReady && (remoteUrl === null || reconnecting);
  const canReconnect = isAuthError(lastError) && isGithubRemote(remoteUrl) && !reconnecting;
  const recoveryReason =
    mode.kind === "needs_fix"
      ? t(`backupPage.status.body.needs_fix_${mode.reason}`)
      : lastError
        ? backupErrorText(lastError, t)
        : t("backupPage.recovery.genericReason");

  return (
    <div className="grid gap-6 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <PageHeader title={t("nav.backup")} subtitle={t("backupPage.subtitle")} />

      <div className="flex min-w-0 flex-col gap-6">
        <StatusCard
          mode={mode}
          status={data}
          deviceName={deviceName.data}
          errorText={lastError ? backupErrorText(lastError, t) : null}
          busy={sync.isPending || connect.isPending}
          onPrimary={primary}
          onReconnect={canReconnect ? () => setReconnecting(true) : undefined}
          onRenameDevice={(name) => renameDevice.mutate(name)}
        />

        {data?.newerAppVersion ? (
          <InlineNotice tone="warning" icon={CircleArrowUp}>
            {t("backupPage.newerApp", { version: data.newerAppVersion })}
          </InlineNotice>
        ) : null}

        <ConflictList conflicts={conflicts.data ?? []} />

        {showConnect ? (
          <div ref={connectPanel}>
            <GithubConnectPanel
              finishing={connect.isPending}
              reconnecting={reconnecting}
              onConnected={connect.finish}
              onCancelReconnect={() => setReconnecting(false)}
            />
          </div>
        ) : null}

        {gitReady ? (
          <RemoteUrlPanel
            key={remoteFormKey}
            currentUrl={remoteUrl}
            onSaved={(cleanUrl) => {
              setLastError(null);
              setSavedRemote(cleanUrl);
              if (!isRepo) setSetupUrl(cleanUrl);
            }}
          />
        ) : null}

        <SnapshotHistory
          enabled={isRepo && gitReady}
          currentSnapshot={data?.currentSnapshot ?? null}
          onRestored={succeeded}
        />
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <BackupContents />
        <AutoBackupCard />
        {remoteUrl ? (
          <DisconnectCard
            remoteUrl={remoteUrl}
            onDisconnected={() => {
              succeeded();
              setSavedRemote(null);
              setRemoteFormKey((value) => value + 1);
            }}
          />
        ) : null}
        <BackupSummary
          skillCount={skills.data?.length}
          snapshotCount={snapshots.data?.length}
          conflictCount={conflicts.data?.length ?? 0}
        />
      </aside>

      <SetupDialog
        url={setupUrl}
        onClose={() => setSetupUrl(null)}
        onDone={succeeded}
        onFailure={failed}
      />
      <RecoveryDialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        reason={recoveryReason}
        remoteUrl={remoteUrl}
        onDone={succeeded}
        onFailure={setLastError}
      />
    </div>
  );
}
