import { Power, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRestartApp } from "@/hooks/mutations/settings-page";
import { api } from "@/lib/api";
import { useAppEvent } from "@/lib/events";

/**
 * The library was deleted while the app ran. Nothing more is written to it; the only ways on are
 * starting fresh or quitting, so the dialog cannot be dismissed.
 */
export function LibraryMissingDialog(): ReactNode {
  const { t } = useTranslation();
  const restart = useRestartApp();
  const [path, setPath] = useState<string | null>(null);

  useAppEvent("library:missing", (payload) => setPath(payload.path));

  return (
    <AlertDialog open={path !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-warning" />
            {t("libraryMissing.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-sm">
              <p data-selectable className="font-mono text-xs break-all">
                {path}
              </p>
              <p>{t("libraryMissing.description")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => void api.app.quit()}>
            {t("libraryMissing.quit")}
          </Button>
          <Button disabled={restart.isPending} onClick={() => restart.mutate()}>
            <Power />
            {t("libraryMissing.restart")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
