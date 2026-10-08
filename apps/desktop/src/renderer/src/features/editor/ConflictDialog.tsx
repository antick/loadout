import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DiffView } from "@/components/DiffView";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLastDefined } from "@/hooks/use-last-defined";

export interface ConflictDialogProps {
  /** Null keeps the dialog closed. */
  conflict: { path: string; mine: string; disk: string | null } | null;
  busy: boolean;
  onOverwrite(): void;
  onUseDisk(): void;
  onCancel(): void;
}

/**
 * The file changed on disk while it was being edited. Shows what the other change did compared
 * with the edit, and lets the user pick a side. Nothing is written until they do.
 */
export function ConflictDialog({
  conflict,
  busy,
  onOverwrite,
  onUseDisk,
  onCancel,
}: ConflictDialogProps): ReactNode {
  const { t } = useTranslation();
  // Closing, it keeps showing what it was about while it fades out.
  const shown = useLastDefined(conflict);
  return (
    <AlertDialog
      open={conflict !== null}
      onOpenChange={(open) => (open || busy ? undefined : onCancel())}
    >
      <AlertDialogContent className="data-[size=default]:sm:max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("editor.conflict.title", { path: shown?.path ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("editor.conflict.description")}</AlertDialogDescription>
        </AlertDialogHeader>

        {shown ? (
          shown.disk === null ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("editor.conflict.unreadable")}
            </p>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <p className="flex gap-4 text-xs text-muted-foreground">
                <span>
                  <span className="font-mono text-danger">-</span> {t("editor.conflict.onDisk")}
                </span>
                <span>
                  <span className="font-mono text-success">+</span> {t("editor.conflict.yours")}
                </span>
              </p>
              <DiffView before={shown.disk} after={shown.mine} className="max-h-[50vh]" />
            </div>
          )
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            {t("editor.conflict.cancel")}
          </AlertDialogCancel>
          <Button variant="outline" disabled={busy || shown?.disk === null} onClick={onUseDisk}>
            {t("editor.conflict.useDisk")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onOverwrite}>
            {busy ? <Spinner /> : null}
            {t("editor.conflict.overwrite")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
