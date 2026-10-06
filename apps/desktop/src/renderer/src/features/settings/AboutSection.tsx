import { Bug, ClipboardCopy, FileArchive, LifeBuoy, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShell } from "@/components/layout/shell-context";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCopyDiagnostics, useExportLogs } from "@/features/settings/settings-mutations";
import { useAppLinks } from "@/hooks/use-app-links";
import { AppUpdatePanel } from "./AppUpdatePanel";

/** Version and updates, help, and everything needed for a useful bug report. */
export function AboutSection(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const exportLogs = useExportLogs();
  const copyDiagnostics = useCopyDiagnostics();
  const links = useAppLinks();

  return (
    <div className="flex flex-col gap-3">
      <AppUpdatePanel />

      <PageSection
        variant="card"
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
            title={t("appLinks.reportBugHint")}
            onClick={links.reportBug}
          >
            <Bug />
            {t("appLinks.reportBug")}
          </Button>
          {links.version ? (
            <Button variant="outline" size="sm" onClick={links.openReleaseNotes}>
              <ScrollText />
              {t("appLinks.releaseNotes")}
            </Button>
          ) : null}
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
      </PageSection>
    </div>
  );
}
