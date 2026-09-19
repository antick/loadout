import {
  formatDateTime,
  parseTimestampCompact,
  SNAPSHOT_TAG_PREFIX,
  type Snapshot,
} from "@skillboard/shared";
import { History, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageSection } from "@/components/PageSection";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestoreSnapshot } from "@/hooks/mutations/backup-page";
import { useBackupSnapshots } from "@/hooks/queries/backup-page";
import { SHORT_COMMIT_LENGTH } from "./constants";

/** `YYYYMMDD-HHMMSS`, the part of a snapshot tag that says when it was taken. */
const COMPACT_STAMP_LENGTH = 15;
const SKELETON_ROWS = 3;

/** When the snapshot was taken, read from its tag; the commit time when the tag is unusual. */
function snapshotLabel(snapshot: Snapshot): string {
  const stamp = snapshot.tag.startsWith(SNAPSHOT_TAG_PREFIX)
    ? snapshot.tag.slice(
        SNAPSHOT_TAG_PREFIX.length,
        SNAPSHOT_TAG_PREFIX.length + COMPACT_STAMP_LENGTH,
      )
    : "";
  const takenAt = parseTimestampCompact(stamp) ?? snapshot.createdAt;
  return formatDateTime(takenAt) || snapshot.tag;
}

export interface SnapshotHistoryProps {
  enabled: boolean;
  currentSnapshot: string | null;
  onRestored: () => void;
}

/** Every snapshot of the library, newest first, each with a way back to it. */
export function SnapshotHistory({
  enabled,
  currentSnapshot,
  onRestored,
}: SnapshotHistoryProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const snapshots = useBackupSnapshots(enabled);
  const restore = useRestoreSnapshot();

  const askRestore = async (snapshot: Snapshot): Promise<void> => {
    const confirmed = await confirm({
      title: t("backupPage.history.restoreTitle", { when: snapshotLabel(snapshot) }),
      description: t("backupPage.history.restoreBody"),
      items: [snapshot.tag],
      confirmLabel: t("backupPage.history.restore"),
    });
    if (confirmed) restore.mutate(snapshot.tag, { onSuccess: onRestored });
  };

  let body: ReactNode;
  if (!enabled) {
    body = (
      <EmptyState
        icon={History}
        title={t("backupPage.history.notSetUpTitle")}
        description={t("backupPage.history.notSetUpBody")}
        className="rounded-lg border border-dashed"
      />
    );
  } else if (snapshots.isPending) {
    body = (
      <div className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (snapshots.isError) {
    body = <ErrorState error={snapshots.error} onRetry={() => void snapshots.refetch()} />;
  } else if (snapshots.data.length === 0) {
    body = (
      <EmptyState
        icon={History}
        title={t("backupPage.history.emptyTitle")}
        description={t("backupPage.history.emptyBody")}
        className="rounded-lg border border-dashed"
      />
    );
  } else {
    body = (
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {snapshots.data.map((snapshot) => {
          const current = snapshot.tag === currentSnapshot;
          return (
            <li key={snapshot.tag} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{snapshotLabel(snapshot)}</span>
                  {current ? (
                    <StatusBadge tone="success" label={t("backupPage.history.current")} />
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={snapshot.tag}>
                  {snapshot.message}
                  {" · "}
                  {snapshot.device}
                  {" · "}
                  <span data-selectable className="font-mono">
                    {snapshot.commit.slice(0, SHORT_COMMIT_LENGTH)}
                  </span>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={current || restore.isPending}
                onClick={() => void askRestore(snapshot)}
              >
                <RotateCcw />
                {t("backupPage.history.restore")}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  return <PageSection title={t("backupPage.history.title")}>{body}</PageSection>;
}
