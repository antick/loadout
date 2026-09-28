import {
  REMOVED_KEEP_DAYS,
  type SyncPreview,
  type SyncPreviewItem,
  type SyncReviewAnswer,
} from "@loadout/shared";
import { Info, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { type DeleteChoice, SyncReviewRow } from "./SyncReviewRow";

export interface SyncReviewDialogProps {
  /** Null keeps the dialog closed. */
  preview: SyncPreview | null;
  syncing: boolean;
  onCancel(): void;
  onSync(answer: SyncReviewAnswer): void;
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">{children}</ul>
    </section>
  );
}

/** Kept apart so its choices start fresh for every preview. */
function ReviewBody({
  preview,
  remoteCommit,
  kept,
  onKept,
}: {
  preview: SyncPreview;
  remoteCommit: string;
  kept: ReadonlySet<string>;
  onKept(next: Set<string>): void;
}): ReactNode {
  const { t } = useTranslation();
  const deletions = preview.incoming.filter((item) => item.change === "deleted");
  const choose = (item: SyncPreviewItem, choice: DeleteChoice): void => {
    const next = new Set(kept);
    if (choice === "keep") next.add(item.id);
    else next.delete(item.id);
    onKept(next);
  };
  const setAll = (choice: DeleteChoice): void =>
    onKept(new Set(choice === "keep" ? deletions.map((item) => item.id) : []));

  if (!preview.perSkill) {
    return (
      <InlineNotice tone="info" icon={Info}>
        {t("backupSync.review.notPerSkill", { count: preview.remoteBackups })}
      </InlineNotice>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {preview.manyDeletes ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          {t("backupSync.review.manyDeletes", { count: deletions.length })}
        </InlineNotice>
      ) : null}
      {preview.incoming.length > 0 ? (
        <Section
          title={t("backupSync.review.incoming")}
          description={
            deletions.length > 0
              ? t("backupSync.review.deletesHint", { days: REMOVED_KEEP_DAYS })
              : undefined
          }
          actions={
            deletions.length > 1 ? (
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => setAll("keep")}>
                  {t("backupSync.review.keepAll")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAll("delete")}>
                  {t("backupSync.review.deleteAll")}
                </Button>
              </div>
            ) : null
          }
        >
          {preview.incoming.map((item) => (
            <SyncReviewRow
              key={item.id}
              item={item}
              remoteCommit={remoteCommit}
              comparable={item.change !== "deleted"}
              {...(item.change === "deleted"
                ? {
                    deleteChoice: kept.has(item.id) ? "keep" : "delete",
                    onDeleteChoice: (choice: DeleteChoice) => choose(item, choice),
                  }
                : {})}
            />
          ))}
        </Section>
      ) : null}
      {preview.conflicts.length > 0 ? (
        <Section
          title={t("backupSync.review.conflicts")}
          description={t("backupSync.review.conflictsHint")}
        >
          {preview.conflicts.map((item) => (
            <SyncReviewRow key={item.id} item={item} remoteCommit={remoteCommit} comparable />
          ))}
        </Section>
      ) : null}
      {preview.outgoing.length > 0 ? (
        <Section title={t("backupSync.review.outgoing")}>
          {preview.outgoing.map((item) => (
            <SyncReviewRow
              key={item.id}
              item={item}
              remoteCommit={remoteCommit}
              comparable={false}
            />
          ))}
        </Section>
      ) : null}
      {preview.presetsIncoming > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("backupSync.review.presets", { count: preview.presetsIncoming })}
        </p>
      ) : null}
    </div>
  );
}

/** What a sync is about to do, before it does it. The only choice is whether deletions happen. */
export function SyncReviewDialog({
  preview,
  syncing,
  onCancel,
  onSync,
}: SyncReviewDialogProps): ReactNode {
  const { t } = useTranslation();
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<string | null>(null);
  const remoteCommit = preview?.remoteCommit ?? null;
  // A new preview starts with every deletion going ahead, as an unreviewed sync would.
  if (remoteCommit !== reviewed) {
    setReviewed(remoteCommit);
    setKept(new Set());
  }

  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && !syncing && onCancel()}>
      <DialogContent className="min-w-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("backupSync.review.title")}</DialogTitle>
          <DialogDescription>
            {t("backupSync.review.description", { count: preview?.remoteBackups ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 max-h-[60vh] min-w-0 overflow-y-auto px-1">
          {preview && remoteCommit ? (
            <ReviewBody
              preview={preview}
              remoteCommit={remoteCommit}
              kept={kept}
              onKept={setKept}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={syncing} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={syncing || !remoteCommit}
            onClick={() => remoteCommit && onSync({ remoteCommit, keep: [...kept] })}
          >
            {syncing ? <Spinner /> : null}
            {t("backupSync.review.sync")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
