import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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

export interface LeaveEditorDialogProps {
  open: boolean;
  /** Files with unsaved changes. */
  paths: readonly string[];
  busy: boolean;
  onSave(): void;
  onDiscard(): void;
  onStay(): void;
}

/** Asked when leaving the editor with unsaved changes. Staying is the safe default. */
export function LeaveEditorDialog({
  open,
  paths,
  busy,
  onSave,
  onDiscard,
  onStay,
}: LeaveEditorDialogProps): ReactNode {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next || busy ? undefined : onStay())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("editor.leave.title", { count: paths.length })}</AlertDialogTitle>
          <AlertDialogDescription>{t("editor.leave.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul
          data-selectable
          className="max-h-40 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs leading-5 break-all"
        >
          {paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onStay}>
            {t("editor.leave.stay")}
          </AlertDialogCancel>
          <Button variant="outline" disabled={busy} onClick={onDiscard}>
            {t("editor.leave.discard")}
          </Button>
          <Button disabled={busy} onClick={onSave}>
            {busy ? <Spinner /> : null}
            {t("editor.leave.save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
