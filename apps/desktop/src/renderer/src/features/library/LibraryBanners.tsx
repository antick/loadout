import { type AppEvents, formatRelative } from "@loadout/shared";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, History } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { keys } from "@/lib/query-keys";

type AutoRun = AppEvents["updates:auto-ran"];

export interface LibraryBannersProps {
  /** Pairs of skills that may be one skill installed twice. */
  duplicateCount: number;
  onReviewDuplicates: () => void;
}

/**
 * Notices above the library: possible duplicates and the last background update round.
 */
export function LibraryBanners({
  duplicateCount,
  onReviewDuplicates,
}: LibraryBannersProps): ReactNode {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Stored by `lib/events.ts` whichever page was open; shown until dismissed or the next round.
  const { data: autoRun } = useQuery<AutoRun | null>({
    queryKey: keys.updates.autoRun,
    queryFn: skipToken,
  });

  if (duplicateCount === 0 && !autoRun) return null;

  return (
    <div className="flex flex-col gap-2">
      {duplicateCount > 0 ? (
        <InlineNotice
          tone="neutral"
          icon={Copy}
          actions={
            <Button variant="ghost" size="xs" onClick={onReviewDuplicates}>
              {t("duplicates.review")}
            </Button>
          }
        >
          {t("duplicates.banner", { count: duplicateCount })}
        </InlineNotice>
      ) : null}
      {autoRun ? (
        <InlineNotice
          tone={autoRun.failed > 0 ? "warning" : "neutral"}
          icon={History}
          actions={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => queryClient.setQueryData(keys.updates.autoRun, null)}
            >
              {t("common.dismiss")}
            </Button>
          }
        >
          {t(autoRun.added > 0 ? "library.banners.autoRanAdded" : "library.banners.autoRan", {
            when: formatRelative(autoRun.ranAt),
            updated: autoRun.updated,
            available: autoRun.available,
            failed: autoRun.failed,
            added: autoRun.added,
          })}
        </InlineNotice>
      ) : null}
    </div>
  );
}
