import {
  type BackupStage,
  REMOVED_KEEP_DAYS,
  type SyncPreview,
  type SyncPreviewItem,
  type SyncReviewAnswer,
} from "@loadout/shared";
import { Info, RefreshCw, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
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
import { BackupStageText } from "./BackupStageText";
import { REVIEW_FILTER_MIN_ITEMS } from "./constants";
import { type ReviewFilter, type ReviewLists, countReview, filterReview } from "./review-filter";
import { SyncReviewFilters } from "./SyncReviewFilters";
import { type DeleteChoice, SyncReviewRow } from "./SyncReviewRow";

export interface SyncReviewDialogProps {
  /** Null keeps the dialog closed. */
  preview: SyncPreview | null;
  syncing: boolean;
  /** What the sync is doing once it runs. */
  stage: BackupStage | null;
  /** The library changed since this review was worked out. */
  stale: boolean;
  /** Work the review out again. */
  onRecheck(): void;
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

/** The review's lists as narrowed by the search and filter; choices are kept for hidden rows. */
function ReviewBody({
  preview,
  lists,
  remoteCommit,
  kept,
  onKept,
  onClearFilters,
}: {
  preview: SyncPreview;
  lists: ReviewLists;
  remoteCommit: string;
  kept: ReadonlySet<string>;
  onKept(next: Set<string>): void;
  onClearFilters(): void;
}): ReactNode {
  const { t } = useTranslation();
  const allDeletions = preview.incoming.filter((item) => item.change === "deleted").length;
  // "Keep all" and "Delete all" answer for the deletions in view only.
  const deletions = lists.incoming.filter((item) => item.change === "deleted");
  const choose = (item: SyncPreviewItem, choice: DeleteChoice): void => {
    const next = new Set(kept);
    if (choice === "keep") next.add(item.id);
    else next.delete(item.id);
    onKept(next);
  };
  const setAll = (choice: DeleteChoice): void => {
    const next = new Set(kept);
    for (const item of deletions) {
      if (choice === "keep") next.add(item.id);
      else next.delete(item.id);
    }
    onKept(next);
  };
  const empty =
    lists.incoming.length + lists.outgoing.length + lists.conflicts.length === 0 &&
    preview.incoming.length + preview.outgoing.length + preview.conflicts.length > 0;

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
          {t("backupSync.review.manyDeletes", { count: allDeletions })}
        </InlineNotice>
      ) : null}
      {empty ? (
        <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
          <p>{t("backupSync.review.noMatch")}</p>
          <Button size="sm" variant="outline" onClick={onClearFilters}>
            {t("backupSync.review.clearFilters")}
          </Button>
        </div>
      ) : null}
      {lists.incoming.length > 0 ? (
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
          {lists.incoming.map((item) => (
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
      {lists.conflicts.length > 0 ? (
        <Section
          title={t("backupSync.review.conflicts")}
          description={t("backupSync.review.conflictsHint")}
        >
          {lists.conflicts.map((item) => (
            <SyncReviewRow key={item.id} item={item} remoteCommit={remoteCommit} comparable />
          ))}
        </Section>
      ) : null}
      {lists.outgoing.length > 0 ? (
        <Section title={t("backupSync.review.outgoing")}>
          {lists.outgoing.map((item) => (
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
  stage,
  stale,
  onRecheck,
  onCancel,
  onSync,
}: SyncReviewDialogProps): ReactNode {
  const { t } = useTranslation();
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [wasOpen, setWasOpen] = useState(false);
  const remoteCommit = preview?.remoteCommit ?? null;
  const clearFilters = (): void => {
    setQuery("");
    setFilter("all");
  };
  // A new preview starts with every deletion going ahead, as an unreviewed sync would.
  if (remoteCommit !== reviewed) {
    setReviewed(remoteCommit);
    setKept(new Set());
    clearFilters();
  }
  // Opened again for the same remote state: the choices stay, an old search does not.
  if ((preview !== null) !== wasOpen) {
    setWasOpen(preview !== null);
    if (preview) clearFilters();
  }
  const counts = useMemo(() => (preview ? countReview(preview) : null), [preview]);
  const lists = useMemo(
    () => (preview ? filterReview(preview, query, filter) : null),
    [preview, query, filter],
  );
  const filterable =
    preview?.perSkill === true &&
    counts !== null &&
    (counts.all >= REVIEW_FILTER_MIN_ITEMS || query !== "" || filter !== "all");

  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && !syncing && onCancel()}>
      <DialogContent className="min-w-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("backupSync.review.title")}</DialogTitle>
          <DialogDescription>
            {t("backupSync.review.description", { count: preview?.remoteBackups ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        {stale ? (
          <InlineNotice
            tone="info"
            icon={RefreshCw}
            actions={
              <Button size="sm" variant="outline" disabled={syncing} onClick={onRecheck}>
                {t("backupSync.review.recheck")}
              </Button>
            }
          >
            {t("backupSync.review.stale")}
          </InlineNotice>
        ) : null}
        {filterable ? (
          <SyncReviewFilters
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            counts={counts}
          />
        ) : null}
        <div className="-mx-1 max-h-[60vh] min-w-0 overflow-y-auto px-1">
          {preview && lists && remoteCommit ? (
            <ReviewBody
              preview={preview}
              lists={lists}
              remoteCommit={remoteCommit}
              kept={kept}
              onKept={setKept}
              onClearFilters={clearFilters}
            />
          ) : null}
        </div>
        <DialogFooter className="items-center">
          <BackupStageText stage={syncing ? stage : null} className="mr-auto" />
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
