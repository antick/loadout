import type { BackupConflict } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConflictDiff } from "@/features/backup/backup-queries";
import { SyncDiffView } from "./SyncDiffView";
import { DIALOG_BODY_SCROLL_CLASS } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useLastDefined } from "@/hooks/use-last-defined";

/** A conflicting skill here against the other device's version, before choosing one. */
export function ConflictDiffDialog({
  conflict,
  onClose,
}: {
  /** Null keeps the dialog closed. */
  conflict: BackupConflict | null;
  onClose(): void;
}): ReactNode {
  const { t } = useTranslation();
  const diff = useConflictDiff(conflict?.skillKey ?? "", conflict !== null);
  // Closing, it keeps showing the conflict while it fades out.
  const shown = useLastDefined(conflict);
  return (
    <Dialog open={conflict !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="min-w-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("backupSync.conflictDiff.title", { name: shown?.skillName ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("backupSync.conflictDiff.description")}</DialogDescription>
        </DialogHeader>
        <div className={cn(DIALOG_BODY_SCROLL_CLASS, "-mx-1 min-w-0 px-1")}>
          {shown ? <SyncDiffView diff={diff} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
