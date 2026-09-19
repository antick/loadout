import { CloudDownload, CloudUpload, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { type StartBackupInput, useStartBackup } from "@/hooks/mutations/backup-page";

export interface SetupDialogProps {
  /** The remote to set up against; null keeps the dialog closed. */
  url: string | null;
  onClose: () => void;
  onDone: () => void;
  onFailure: (error: unknown) => void;
}

const CHOICES: readonly { mode: StartBackupInput["mode"]; icon: LucideIcon }[] = [
  { mode: "restore", icon: CloudDownload },
  { mode: "new", icon: CloudUpload },
];

/** First connection of a library that is not a repository yet: restore from, or fill, the remote. */
export function SetupDialog({ url, onClose, onDone, onFailure }: SetupDialogProps): ReactNode {
  const { t } = useTranslation();
  const startBackup = useStartBackup();

  const choose = (mode: StartBackupInput["mode"]): void => {
    if (!url) return;
    startBackup.mutate(
      { url, mode, isRepo: false },
      {
        onSuccess: () => {
          onDone();
          onClose();
        },
        onError: onFailure,
      },
    );
  };

  return (
    <Dialog
      open={url !== null}
      onOpenChange={(open) => (!open && !startBackup.isPending ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("backupPage.setup.title")}</DialogTitle>
          <DialogDescription>
            {t("backupPage.setup.description")}{" "}
            <span data-selectable className="font-mono text-xs break-all">
              {url}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {CHOICES.map(({ mode, icon: Icon }) => {
            const running = startBackup.isPending && startBackup.variables?.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={startBackup.isPending}
                onClick={() => choose(mode)}
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  {running ? <Spinner /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {t(`backupPage.setup.${mode}.title`)}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {t(`backupPage.setup.${mode}.body`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
