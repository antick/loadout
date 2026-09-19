import { formatRelative } from "@skillboard/shared";
import { ArrowUpCircle, History } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { useAppEvent } from "@/lib/events";

interface AutoRun {
  ranAt: number;
  updated: number;
  available: number;
  failed: number;
}

export interface LibraryBannersProps {
  /** Skills with an update waiting. */
  updateCount: number;
  /** The list is already filtered to those skills, so "View" would do nothing. */
  viewingUpdates: boolean;
  onViewUpdates: () => void;
}

/** Notices above the library: updates waiting, and the last background update round. */
export function LibraryBanners({
  updateCount,
  viewingUpdates,
  onViewUpdates,
}: LibraryBannersProps): ReactNode {
  const { t } = useTranslation();
  const [autoRun, setAutoRun] = useState<AutoRun | null>(null);
  useAppEvent("updates:auto-ran", setAutoRun);

  if (updateCount === 0 && !autoRun) return null;

  return (
    <div className="flex flex-col gap-2">
      {updateCount > 0 ? (
        <InlineNotice
          tone="info"
          icon={ArrowUpCircle}
          actions={
            viewingUpdates ? null : (
              <Button variant="ghost" size="xs" onClick={onViewUpdates}>
                {t("library.banners.view")}
              </Button>
            )
          }
        >
          {t("library.banners.updatesAvailable", { count: updateCount })}
        </InlineNotice>
      ) : null}
      {autoRun ? (
        <InlineNotice
          tone={autoRun.failed > 0 ? "warning" : "neutral"}
          icon={History}
          actions={
            <Button variant="ghost" size="xs" onClick={() => setAutoRun(null)}>
              {t("common.dismiss")}
            </Button>
          }
        >
          {t("library.banners.autoRan", {
            when: formatRelative(autoRun.ranAt),
            updated: autoRun.updated,
            available: autoRun.available,
            failed: autoRun.failed,
          })}
        </InlineNotice>
      ) : null}
    </div>
  );
}
