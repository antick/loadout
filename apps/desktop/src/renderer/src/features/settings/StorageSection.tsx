import { formatBytes } from "@loadout/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { Panel } from "@/components/Panel";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStorageReport } from "@/hooks/queries/storage";
import { clearStored, countStored } from "@/lib/interface-state";
import { toastSuccess } from "@/lib/toast";
import { LibraryLocationCard } from "./LibraryLocationCard";
import { RemoveAllDataPanel } from "./RemoveAllDataPanel";
import { StorageAreaList } from "./StorageAreaList";

const OUTSIDE_ITEMS = ["agents", "projects", "backup", "keychain", "system"] as const;

/** Where Loadout keeps its data, how much, and the ways to clean it up. */
export function StorageSection(): ReactNode {
  const { t } = useTranslation();
  const report = useStorageReport();
  // Web storage is not reactive; re-read after clearing.
  const [counts, setCounts] = useState(() => ({
    preferences: countStored("preferences"),
    drafts: countStored("drafts"),
  }));

  const forget = (area: "preferences" | "drafts"): void => {
    clearStored(area);
    setCounts({ preferences: countStored("preferences"), drafts: countStored("drafts") });
    toastSuccess(t(`settings.storage.window.${area}.done`));
    // Preferences are read when components mount; reload so the defaults show at once.
    if (area === "preferences") window.location.reload();
  };

  if (report.error)
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const data = report.data;

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title={t("settings.storage.home.title")}
        description={t("settings.storage.home.description")}
        actions={
          data ? (
            <span className="font-mono text-sm tabular-nums">{formatBytes(data.totalBytes)}</span>
          ) : null
        }
      >
        {data ? <PathText path={data.homePath} /> : <Skeleton className="h-4 w-48" />}
        {data ? (
          <StorageAreaList entries={data.entries} />
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </Panel>

      <LibraryLocationCard />

      <Panel
        title={t("settings.storage.window.title")}
        description={t("settings.storage.window.description")}
      >
        <ul className="flex flex-col divide-y">
          {(["preferences", "drafts"] as const).map((area) => (
            <li key={area} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`settings.storage.window.${area}.title`)}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`settings.storage.window.${area}.description`, { count: counts[area] })}
                </p>
              </div>
              <Button
                variant="outline"
                size="xs"
                disabled={counts[area] === 0}
                onClick={() => forget(area)}
              >
                {t(`settings.storage.window.${area}.action`)}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title={t("settings.storage.outside.title")}
        description={t("settings.storage.outside.description")}
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
          {OUTSIDE_ITEMS.map((item) => (
            <li key={item}>{t(`settings.storage.outside.${item}`)}</li>
          ))}
        </ul>
      </Panel>

      {data ? <RemoveAllDataPanel homePath={data.homePath} /> : null}
    </div>
  );
}
