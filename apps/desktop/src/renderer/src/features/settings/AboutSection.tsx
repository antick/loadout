import { formatRelative } from "@loadout/shared";
import { Bug, ClipboardCopy, FileArchive, LifeBuoy, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { useShell } from "@/components/layout/shell-context";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useClearLastCrash } from "@/hooks/mutations/app";
import { useCopyDiagnostics, useExportLogs } from "@/hooks/mutations/settings-page";
import { useLastCrash, useLibraryLocation } from "@/hooks/queries/app";
import { AppUpdatePanel } from "./AppUpdatePanel";

/** Version and updates, help, and everything needed for a useful bug report. */
export function AboutSection(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const crash = useLastCrash();
  const location = useLibraryLocation();
  const clearCrash = useClearLastCrash();
  const exportLogs = useExportLogs();
  const copyDiagnostics = useCopyDiagnostics();

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

      <AppUpdatePanel />

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
