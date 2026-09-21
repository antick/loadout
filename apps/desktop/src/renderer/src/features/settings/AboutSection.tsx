import { formatRelative } from "@loadout/shared";
import {
  Bug,
  ClipboardCopy,
  ExternalLink,
  FileArchive,
  LifeBuoy,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { useShell } from "@/components/layout/shell-context";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useClearLastCrash, useOpenExternal } from "@/hooks/mutations/app";
import {
  useCheckAppUpdate,
  useCopyDiagnostics,
  useExportLogs,
} from "@/hooks/mutations/settings-page";
import { useAppInfo, useLastCrash, useLibraryLocation } from "@/hooks/queries/app";

/** Version and updates, help, and everything needed for a useful bug report. */
export function AboutSection(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const info = useAppInfo();
  const crash = useLastCrash();
  const location = useLibraryLocation();
  const clearCrash = useClearLastCrash();
  const checkUpdate = useCheckAppUpdate();
  const exportLogs = useExportLogs();
  const copyDiagnostics = useCopyDiagnostics();
  const openExternal = useOpenExternal();
  const update = checkUpdate.data;
  const releaseUrl = update?.releaseUrl;

  let updateText: string | null = null;
  if (update && !update.configured) updateText = t("settings.about.updatesNotConfigured");
  else if (update?.hasUpdate)
    updateText = t("settings.about.updateAvailable", { version: update.latestVersion ?? "" });
  else if (update) updateText = t("settings.about.upToDate");

  return (
    <div className="flex flex-col gap-3">
      {crash.data ? (
        <InlineNotice
          tone="danger"
          icon={Bug}
          actions={
            <Button
              variant="ghost"
              size="xs"
              disabled={clearCrash.isPending}
              onClick={() => clearCrash.mutate()}
            >
              {t("common.dismiss")}
            </Button>
          }
        >
          <p className="font-medium">
            {t("banners.crashTitle", { when: formatRelative(crash.data.at) })}
          </p>
          <p data-selectable className="font-mono text-xs break-words whitespace-pre-line">
            {crash.data.message}
          </p>
        </InlineNotice>
      ) : null}
      {location.data?.warnings.map((warning) => (
        <InlineNotice key={warning} tone="warning" icon={TriangleAlert}>
          {t(`banners.libraryWarnings.${warning}`)}
        </InlineNotice>
      ))}

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
            disabled={checkUpdate.isPending}
            onClick={() => checkUpdate.mutate()}
          >
            {checkUpdate.isPending ? <Spinner /> : <RefreshCw />}
            {t("settings.about.checkUpdates")}
          </Button>
        </div>
        {updateText ? (
          <output className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {updateText}
            {update?.hasUpdate && releaseUrl ? (
              <Button variant="link" size="xs" onClick={() => openExternal.mutate(releaseUrl)}>
                {t("settings.about.viewRelease")}
                <ExternalLink />
              </Button>
            ) : null}
          </output>
        ) : null}
      </Panel>

      <Panel
        title={t("settings.about.supportTitle")}
        description={t("settings.about.supportDescription")}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={shell.openHelp}>
            <LifeBuoy />
            {t("nav.help")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exportLogs.isPending}
            onClick={() => exportLogs.mutate()}
          >
            {exportLogs.isPending ? <Spinner /> : <FileArchive />}
            {t("settings.about.exportLogs")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={copyDiagnostics.isPending}
            onClick={() => copyDiagnostics.mutate()}
          >
            {copyDiagnostics.isPending ? <Spinner /> : <ClipboardCopy />}
            {t("settings.about.copyDiagnostics")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.about.privacy")}</p>
      </Panel>
    </div>
  );
}
