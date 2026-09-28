import type { SyncSkillDiff } from "@loadout/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { FileDiffList } from "@/components/FileDiffList";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One skill on this computer (`-`) against another device's version (`+`), file by file. Used by
 * the sync review and by the conflict list.
 */
export function SyncDiffView({ diff }: { diff: UseQueryResult<SyncSkillDiff> }): ReactNode {
  const { t } = useTranslation();
  if (diff.isError) return <ErrorState error={diff.error} onRetry={() => void diff.refetch()} />;
  if (!diff.data) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-mono text-danger">-</span> {t("backupSync.diff.here")}
        </span>
        <span>
          <span className="font-mono text-success">+</span> {t("backupSync.diff.other")}
        </span>
      </p>
      <FileDiffList entries={diff.data.entries} />
    </div>
  );
}
