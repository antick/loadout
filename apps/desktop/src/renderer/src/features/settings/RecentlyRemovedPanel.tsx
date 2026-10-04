import {
  APP_NAME,
  formatBytes,
  formatDate,
  formatRelative,
  REMOVED_KEEP_DAYS,
  type RemovedFolder,
} from "@loadout/shared";
import { ArchiveRestore, FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { Panel } from "@/components/Panel";
import { PathText } from "@/components/PathText";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  useClearStorage,
  useDeleteRemoved,
  useRestoreRemoved,
  useRevealRemoved,
} from "@/features/settings/storage-mutations";
import { useRemovedFolders } from "@/features/settings/storage-queries";
import { Skeletons } from "@/components/Skeletons";

const SKELETON_ROWS = 2;

/**
 * Skills deleted from the library, and skill folders the app took out of agent and project
 * folders (replaced by the library version, or deleted), each with a way back.
 */
export function RecentlyRemovedPanel(): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const removed = useRemovedFolders();
  const restore = useRestoreRemoved();
  const remove = useDeleteRemoved();
  const reveal = useRevealRemoved();
  const clear = useClearStorage();
  const entries = removed.data ?? [];

  const askRestore = async (entry: RemovedFolder): Promise<void> => {
    if (entry.occupied) {
      const ok = await confirm({
        title: t("settings.storage.removed.confirmRestore.title", { name: entry.name }),
        description: t("settings.storage.removed.confirmRestore.description"),
        items: [entry.originalPath],
        confirmLabel: t("settings.storage.removed.restore"),
      });
      if (!ok) return;
    }
    restore.mutate(entry);
  };

  const askDelete = async (entry: RemovedFolder): Promise<void> => {
    const ok = await confirm({
      title: t("settings.storage.removed.confirmDelete.title", { name: entry.name }),
      description: t("settings.storage.removed.confirmDelete.description"),
      confirmLabel: t("settings.storage.removed.deleteForGood"),
      destructive: true,
    });
    if (ok) remove.mutate(entry);
  };

  const askClear = async (): Promise<void> => {
    const ok = await confirm({
      title: t("settings.storage.removed.confirmClear.title", { count: entries.length }),
      description: t("settings.storage.areas.removed.clearEffect"),
      confirmLabel: t("settings.storage.removed.clearAll"),
      destructive: true,
    });
    if (ok) clear.mutate("removed");
  };

  let body: ReactNode;
  if (removed.isPending) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeletons count={SKELETON_ROWS} className="h-12 w-full" />
      </div>
    );
  } else if (removed.isError) {
    body = <ErrorState error={removed.error} onRetry={() => void removed.refetch()} />;
  } else if (entries.length === 0) {
    body = (
      <EmptyState
        icon={ArchiveRestore}
        title={t("settings.storage.removed.emptyTitle")}
        description={t("settings.storage.removed.emptyBody", { days: REMOVED_KEEP_DAYS })}
        className="rounded-lg border border-dashed"
      />
    );
  } else {
    body = (
      <ul className="flex flex-col divide-y">
        {entries.map((entry) => {
          const restoring = restore.isPending && restore.variables?.id === entry.id;
          // A library skill never displaces the one that took its folder name.
          const libraryTaken = entry.library && entry.occupied;
          return (
            <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="truncate">{entry.name}</span>
                  <StatusBadge
                    tone={entry.reason === "replaced" ? "info" : "neutral"}
                    label={t(`settings.storage.removed.reason.${entry.reason}`)}
                  />
                </p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={t("settings.storage.removed.keptUntil", {
                    date: formatDate(entry.expiresAt),
                  })}
                >
                  {entry.place}
                  {" · "}
                  {formatRelative(entry.removedAt)}
                  {" · "}
                  {formatBytes(entry.bytes)}
                </p>
                <PathText path={entry.originalPath} reveal={false} />
                {entry.library && !libraryTaken ? (
                  <p className="text-xs text-muted-foreground">
                    {t("settings.storage.removed.libraryNote")}
                  </p>
                ) : null}
                {libraryTaken ? (
                  <p className="text-xs text-warning">
                    {t("settings.storage.removed.libraryTaken")}
                  </p>
                ) : null}
                {entry.parentMissing ? (
                  <p className="text-xs text-warning">
                    {t("settings.storage.removed.parentMissing")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={entry.parentMissing || libraryTaken || restoring}
                  onClick={() => void askRestore(entry)}
                >
                  {restoring ? <Spinner className="size-3" /> : <RotateCcw />}
                  {t("settings.storage.removed.restore")}
                </Button>
                <IconButton
                  label={t("common.reveal")}
                  icon={<FolderOpen />}
                  onClick={() => reveal.mutate(entry.id)}
                />
                <IconButton
                  label={t("settings.storage.removed.deleteForGood")}
                  icon={<Trash2 />}
                  onClick={() => void askDelete(entry)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Panel
      id="recently-removed"
      title={t("settings.storage.removed.title")}
      description={t("settings.storage.removed.description", {
        app: APP_NAME,
        days: REMOVED_KEEP_DAYS,
      })}
      actions={
        entries.length > 0 ? (
          <Button
            variant="outline"
            size="xs"
            disabled={clear.isPending}
            onClick={() => void askClear()}
          >
            {t("settings.storage.removed.clearAll")}
          </Button>
        ) : null
      }
    >
      {body}
    </Panel>
  );
}
