import { FolderOpen, Power, TriangleAlert, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Panel } from "@/components/Panel";
import { PathText } from "@/components/PathText";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePickFolder,
  useRestartApp,
  useRevealLibrary,
  useSetLibraryPath,
} from "@/hooks/mutations/settings-page";
import { useLibraryLocation } from "@/hooks/queries/app";

/** Where the library lives. A new location only takes effect after a restart. */
export function LibraryLocationCard(): ReactNode {
  const { t } = useTranslation();
  const location = useLibraryLocation();
  const pickFolder = usePickFolder();
  const setPath = useSetLibraryPath();
  const reveal = useRevealLibrary();
  const restart = useRestartApp();
  const data = location.data;

  const change = (): void =>
    pickFolder.mutate(t("settings.general.library.pickTitle"), {
      onSuccess: (picked) => {
        if (picked) setPath.mutate(picked);
      },
    });

  return (
    <Panel
      title={t("settings.general.library.title")}
      description={t("settings.general.library.description")}
    >
      {data ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <PathText path={data.path} />
            <StatusBadge
              tone={data.overridden ? "info" : "neutral"}
              label={t(
                data.overridden
                  ? "settings.general.library.custom"
                  : "settings.general.library.default",
              )}
            />
          </div>
          {data.warnings.map((warning) => (
            <InlineNotice key={warning} tone="warning" icon={TriangleAlert}>
              {t(`banners.libraryWarnings.${warning}`)}
            </InlineNotice>
          ))}
          {data.pendingPath ? (
            <InlineNotice
              tone="info"
              icon={Power}
              actions={
                <Button size="xs" disabled={restart.isPending} onClick={() => restart.mutate()}>
                  {t("settings.general.library.restart")}
                </Button>
              }
            >
              <p className="font-medium">{t("settings.general.library.restartTitle")}</p>
              <p data-selectable className="font-mono text-xs break-all">
                {data.pendingPath}
              </p>
            </InlineNotice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pickFolder.isPending || setPath.isPending}
              onClick={change}
            >
              {t("settings.general.library.change")}
            </Button>
            {data.overridden || data.pendingPath ? (
              <Button
                variant="outline"
                size="sm"
                disabled={setPath.isPending}
                onClick={() => setPath.mutate(null)}
              >
                <Undo2 />
                {t("settings.general.library.reset")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => reveal.mutate()}>
              <FolderOpen />
              {t("settings.general.library.open")}
            </Button>
          </div>
        </>
      ) : (
        <Skeleton className="h-16 w-full" />
      )}
    </Panel>
  );
}
