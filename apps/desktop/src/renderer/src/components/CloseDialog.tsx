import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useResolveClose } from "@/hooks/mutations/app";
import { useAppEvent } from "@/lib/events";

/** Asks "quit or keep running in the tray?" when the main process reports a window close. */
export function CloseDialog(): ReactNode {
  const { t } = useTranslation();
  const resolveClose = useResolveClose();
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const rememberId = useId();

  useAppEvent("window:close-requested", () => {
    setRemember(false);
    setOpen(true);
  });

  const answer = (action: "hide" | "quit"): void => {
    setOpen(false);
    resolveClose.mutate({ action, remember });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("closeDialog.title")}</DialogTitle>
          <DialogDescription>{t("closeDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id={rememberId}
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <Label htmlFor={rememberId} className="font-normal">
            {t("closeDialog.remember")}
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer("quit")}>
            {t("closeDialog.quit")}
          </Button>
          <Button onClick={() => answer("hide")}>{t("closeDialog.hide")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
