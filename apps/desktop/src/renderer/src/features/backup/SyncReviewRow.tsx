import type { SyncChange, SyncPreviewItem } from "@loadout/shared";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreviewDiff } from "@/features/backup/backup-queries";
import { cn } from "@/lib/utils";
import { SyncDiffView } from "./SyncDiffView";

const CHANGE_TONES: Record<SyncChange, StatusTone> = {
  added: "success",
  changed: "info",
  renamed: "neutral",
  details: "neutral",
  deleted: "danger",
};

/** What happens to a skill another device deleted. */
export type DeleteChoice = "delete" | "keep";
const DELETE_CHOICES: readonly DeleteChoice[] = ["delete", "keep"];

export interface SyncReviewRowProps {
  item: SyncPreviewItem;
  remoteCommit: string;
  /** Offer the other device's version file by file. */
  comparable: boolean;
  /** Set for a deletion coming in: the user picks whether it happens here. */
  deleteChoice?: DeleteChoice;
  onDeleteChoice?: (choice: DeleteChoice) => void;
}

/** One skill in the sync review: what changes, who changed it, and its files on demand. */
export function SyncReviewRow({
  item,
  remoteCommit,
  comparable,
  deleteChoice,
  onDeleteChoice,
}: SyncReviewRowProps): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const diff = usePreviewDiff(item.id, remoteCommit, comparable && open);
  const details = [
    item.previousPath ? t("backupSync.review.renamedFrom", { path: item.previousPath }) : null,
    item.fromDevice ? t("backupSync.review.fromDevice", { device: item.fromDevice }) : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          tone={CHANGE_TONES[item.change]}
          label={t(`backupSync.review.change.${item.change}`)}
        />
        <div className="min-w-32 flex-1">
          <p
            data-selectable
            className={cn(
              "truncate text-sm font-medium",
              deleteChoice === "delete" && "text-muted-foreground line-through",
            )}
          >
            {item.name}
          </p>
          {details.length > 0 ? (
            <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
          ) : null}
        </div>
        {comparable ? (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronRight
              className={cn("transition-transform duration-150", open && "rotate-90")}
            />
            {t("backupSync.review.viewChanges")}
          </Button>
        ) : null}
        {deleteChoice && onDeleteChoice ? (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={deleteChoice}
            aria-label={t("backupSync.review.deleteChoice", { name: item.name })}
            onValueChange={(next) => {
              const choice = DELETE_CHOICES.find((option) => option === next);
              if (choice) onDeleteChoice(choice);
            }}
          >
            {DELETE_CHOICES.map((choice) => (
              <ToggleGroupItem key={choice} value={choice} className="px-2.5">
                {t(`backupSync.review.${choice}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
      </div>
      {comparable && open ? <SyncDiffView diff={diff} /> : null}
    </li>
  );
}
