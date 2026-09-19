import { CloudDownload } from "lucide-react";
import type { ReactNode } from "react";
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
import { useRecloneBackup } from "@/hooks/mutations/backup-page";

export interface RecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Why the dialog opened, in plain words. */
  reason: string;
  remoteUrl: string | null;
  onDone: () => void;
  onFailure: (error: unknown) => void;
}

/** The way out when this library and the remote no longer fit together. */
export function RecoveryDialog({
  open,
  onOpenChange,
  reason,
  remoteUrl,
  onDone,
  onFailure,
}: RecoveryDialogProps): ReactNode {
  const { t } = useTranslation();
  const reclone = useRecloneBackup();

  const run = (): void => {
    if (!remoteUrl) return;
    reclone.mutate(remoteUrl, {
      onSuccess: () => {
        onDone();
        onOpenChange(false);
      },
      onError: onFailure,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (reclone.isPending ? undefined : onOpenChange(next))}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("backupPage.recovery.title")}</DialogTitle>
          <DialogDescription data-selectable>{reason}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm font-medium">{t("backupPage.recovery.optionTitle")}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("backupPage.recovery.pointRemote")}</li>
            <li>{t("backupPage.recovery.pointLocalOnly")}</li>
            <li>{t("backupPage.recovery.pointOldFolder")}</li>
          </ul>
        </div>
        {remoteUrl ? null : (
          <InlineNotice tone="warning" icon={CloudDownload}>
            {t("backupPage.recovery.noRemote")}
          </InlineNotice>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={reclone.isPending} onClick={() => onOpenChange(false)}>
            {t("backupPage.recovery.notNow")}
          </Button>
          <Button disabled={!remoteUrl || reclone.isPending} onClick={run}>
            {reclone.isPending ? <Spinner /> : <CloudDownload />}
            {t("backupPage.recovery.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
