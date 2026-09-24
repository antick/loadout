import { type AppUpdateStatus, formatBytes, formatRelative, isNewerVersion } from "@loadout/shared";
import { Download, ExternalLink, RefreshCw, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useOpenExternal } from "@/hooks/mutations/app";
import {
  useCancelAppUpdate,
  useCheckAppUpdate,
  useDownloadAppUpdate,
  useInstallAppUpdate,
} from "@/hooks/mutations/app-update";
import { useAppInfo, useAppUpdate } from "@/hooks/queries/app";

/** A newer version is known and this copy could fetch it. */
function canDownload(status: AppUpdateStatus): boolean {
  if (status.blocker || !status.latestVersion) return false;
  if (!isNewerVersion(status.latestVersion, status.currentVersion)) return false;
  return status.phase === "available" || status.phase === "error";
}

function StatusLine({ status }: { status: AppUpdateStatus }): ReactNode {
  const { t } = useTranslation();
  const version = status.latestVersion ?? "";
  const newer = status.latestVersion
    ? isNewerVersion(status.latestVersion, status.currentVersion)
    : false;
  switch (status.phase) {
    case "checking":
      return t("settings.about.checking");
    case "up_to_date":
      return t("settings.about.upToDate");
    case "available":
      return t("settings.about.updateAvailable", { version });
    case "downloading":
      return t("settings.about.downloading", {
        version,
        received: formatBytes(status.progress?.received ?? 0),
        total: formatBytes(status.progress?.total ?? 0),
      });
    case "ready":
      return t("settings.about.ready", { version });
    case "installing":
      return t("settings.about.installing");
    case "error":
      return newer
        ? t("settings.about.downloadError", { version, error: status.error ?? "" })
        : t("settings.about.checkError", { error: status.error ?? "" });
    default:
      return null;
  }
}

/** Version, and the whole update flow: check, download with progress, restart to install. */
export function AppUpdatePanel(): ReactNode {
  const { t } = useTranslation();
  const info = useAppInfo();
  const update = useAppUpdate();
  const check = useCheckAppUpdate();
  const download = useDownloadAppUpdate();
  const cancel = useCancelAppUpdate();
  const install = useInstallAppUpdate();
  const openExternal = useOpenExternal();
  const status = update.data;

  const busy =
    status?.phase === "checking" ||
    status?.phase === "downloading" ||
    status?.phase === "installing";
  const blockerShown =
    status?.blocker &&
    (status.blocker === "not_configured" ||
      status.blocker === "development" ||
      status.phase === "available");
  const progress = status?.progress;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight">{info.data?.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {info.data ? t("shell.version", { version: info.data.version }) : null}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || check.isPending || status?.blocker === "not_configured"}
          onClick={() => check.mutate()}
        >
          {status?.phase === "checking" ? <Spinner /> : <RefreshCw />}
          {t("settings.about.checkUpdates")}
        </Button>
      </div>

      {status ? (
        <output className="flex flex-col gap-2 text-sm text-muted-foreground">
          <span>
            <StatusLine status={status} />
            {status.checkedAt && status.phase === "up_to_date" ? (
              <span className="ml-1 text-xs">
                {t("settings.about.lastChecked", { when: formatRelative(status.checkedAt) })}
              </span>
            ) : null}
          </span>
          {status.phase === "downloading" && progress ? (
            <Progress
              value={progress.total > 0 ? (progress.received / progress.total) * 100 : 0}
              aria-label={t("settings.about.downloadProgress")}
            />
          ) : null}
          {blockerShown ? <span>{t(`settings.about.blockers.${status.blocker}`)}</span> : null}
          {status.phase === "ready" && status.method === "package" ? (
            <span>{t("settings.about.packageHint")}</span>
          ) : null}
        </output>
      ) : null}

      {status ? (
        <div className="flex flex-wrap items-center gap-2">
          {canDownload(status) ? (
            <Button size="sm" disabled={download.isPending} onClick={() => download.mutate()}>
              <Download />
              {t("settings.about.downloadUpdate")}
            </Button>
          ) : null}
          {status.phase === "downloading" ? (
            <Button variant="outline" size="sm" onClick={() => cancel.mutate()}>
              <X />
              {t("common.cancel")}
            </Button>
          ) : null}
          {status.phase === "ready" ? (
            <Button size="sm" disabled={install.isPending} onClick={() => install.mutate()}>
              <RotateCcw />
              {t(
                status.method === "package"
                  ? "settings.about.openInstaller"
                  : "settings.about.restartToUpdate",
              )}
            </Button>
          ) : null}
          {status.phase === "available" && status.blocker ? (
            <Button size="sm" onClick={() => openExternal.mutate(status.releaseUrl)}>
              <Download />
              {t("settings.about.getFromRelease")}
            </Button>
          ) : null}
          {status.latestVersion && isNewerVersion(status.latestVersion, status.currentVersion) ? (
            <Button variant="link" size="xs" onClick={() => openExternal.mutate(status.releaseUrl)}>
              {t("settings.about.viewRelease")}
              <ExternalLink />
            </Button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
