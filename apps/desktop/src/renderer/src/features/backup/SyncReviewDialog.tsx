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
import { SearchInput } from "@/components/SearchInput";
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
import { REVIEW_SEARCH_MIN_ITEMS } from "./constants";
import { type ReviewLists, filterReview, reviewSize } from "./review-filter";
import { type DeleteChoice, SyncReviewRow } from "./SyncReviewRow";
import { setMany } from "@/lib/sets";
import { DIALOG_BODY_SCROLL_CLASS } from "@/lib/styles";
import { cn } from "@/lib/utils";

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

/** The review's lists as narrowed by the search; choices are kept for hidden rows. */
function ReviewBody({
  preview,
  lists,
  remoteCommit,
  kept,
  onKept,
}: {
  preview: SyncPreview;
  lists: ReviewLists;
  remoteCommit: string;
  kept: ReadonlySet<string>;
  onKept(next: Set<string>): void;
}): ReactNode {
  const { t } = useTranslation();
  const allDeletions = preview.incoming.filter((item) => item.change === "deleted").length;
  // "Keep all" and "Delete all" answer for the deletions in view only.
  const deletions = lists.incoming.filter((item) => item.change === "deleted");
  const choose = (item: SyncPreviewItem, choice: DeleteChoice): void =>
    onKept(setMany(kept, [item.id], choice === "keep"));
  const setAll = (choice: DeleteChoice): void =>
    onKept(
      setMany(
        kept,
        deletions.map((item) => item.id),
        choice === "keep",
      ),
    );
  const empty = reviewSize(lists) === 0 && reviewSize(preview) > 0;

  if (!preview.perSkill) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {preview.manyDeletes ? (
          <InlineNotice tone="warning" icon={TriangleAlert}>
            {t("backupSync.review.manyDeletesNotPerSkill", {
              count: allDeletions,
              days: REMOVED_KEEP_DAYS,
            })}
          </InlineNotice>
        ) : null}
        <InlineNotice tone="info" icon={Info}>
          {t("backupSync.review.notPerSkill", { count: preview.remoteBackups })}
        </InlineNotice>
      </div>
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
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("backupSync.review.noMatch")}
        </p>
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
  const [wasOpen, setWasOpen] = useState(false);
  const remoteCommit = preview?.remoteCommit ?? null;
  // A new preview starts with every deletion going ahead, as an unreviewed sync would.
  if (remoteCommit !== reviewed) {
    setReviewed(remoteCommit);
    setKept(new Set());
    setQuery("");
  }
  // Opened again for the same remote state: the choices stay, an old search does not.
  if ((preview !== null) !== wasOpen) {
    setWasOpen(preview !== null);
    if (preview) setQuery("");
  }
  const lists = useMemo(() => (preview ? filterReview(preview, query) : null), [preview, query]);
  const searchable =
    preview?.perSkill === true && (reviewSize(preview) >= REVIEW_SEARCH_MIN_ITEMS || query !== "");

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
        {searchable ? (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("backupSync.review.search")}
            focusHotkey={false}
          />
        ) : null}
        <div className={cn(DIALOG_BODY_SCROLL_CLASS, "-mx-1 min-w-0 px-1")}>
          {preview && lists && remoteCommit ? (
            <ReviewBody
              preview={preview}
              lists={lists}
              remoteCommit={remoteCommit}
              kept={kept}
              onKept={setKept}
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
