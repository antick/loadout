import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useRemoveAllData } from "@/hooks/mutations/storage";

const REMOVE_COPIES_ID = "remove-all-data-copies";

/** Delete everything Loadout keeps on this computer and quit, after saying exactly what goes. */
export function RemoveAllDataPanel({ homePath }: { homePath: string }): ReactNode {
  const { t } = useTranslation();
  const remove = useRemoveAllData();
  const [open, setOpen] = useState(false);
  const [removeCopies, setRemoveCopies] = useState(false);

  return (
    <Panel
      tone="danger"
      title={t("settings.storage.removeAll.title")}
      description={t("settings.storage.removeAll.description")}
      actions={
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Trash2 />
          {t("settings.storage.removeAll.button")}
        </Button>
      }
    >
      <AlertDialog open={open} onOpenChange={(next) => !remove.isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.storage.removeAll.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <p>{t("settings.storage.removeAll.deletes", { path: homePath })}</p>
                <p>{t("settings.storage.removeAll.links")}</p>
                <p>{t("settings.storage.removeAll.keeps")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox
              id={REMOVE_COPIES_ID}
              checked={removeCopies}
              onCheckedChange={(checked) => setRemoveCopies(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor={REMOVE_COPIES_ID} className="leading-5 font-normal">
              {t("settings.storage.removeAll.copies")}
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ removeCopies })}
            >
              {remove.isPending ? <Spinner /> : <Trash2 />}
              {t("settings.storage.removeAll.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
