import { ShieldAlert } from "lucide-react";
import { type ReactNode, useRef, useSyncExternalStore } from "react";
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
import { getFlaggedPrompt, subscribeFlaggedPrompt } from "./flagged-prompt";
import { SafetyReportView } from "./SafetyReportView";

/**
 * Shown when the safety check stopped an install: what it found in each flagged skill, and the
 * choice. Not installing is the default; installing anyway is a deliberate second button.
 */
export function FlaggedInstallDialog(): ReactNode {
  const { t } = useTranslation();
  const prompt = useSyncExternalStore(subscribeFlaggedPrompt, getFlaggedPrompt);
  const flagged = prompt?.flagged ?? [];
  const [only] = flagged;
  const safeChoice = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={prompt !== null}
      onOpenChange={(open) => (open ? undefined : prompt?.answer(false))}
    >
      <DialogContent
        className="sm:max-w-2xl"
        // Enter or Space right after it opens must never install.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          safeChoice.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 shrink-0 text-danger" />
            {only && flagged.length === 1
              ? t("safety.prompt.titleOne", { name: only.name })
              : t("safety.prompt.titleMany", { count: flagged.length })}
          </DialogTitle>
          <DialogDescription>{t("safety.prompt.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 flex max-h-[55vh] flex-col gap-4 overflow-y-auto border-y px-6 py-4">
          {flagged.map((entry) => (
            <section key={entry.name} className="flex flex-col gap-2">
              {flagged.length > 1 ? (
                <h3 className="font-mono text-sm font-medium">{entry.name}</h3>
              ) : null}
              <SafetyReportView report={entry.report} />
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="text-danger hover:text-danger"
            onClick={() => prompt?.answer(true)}
          >
            {t("safety.prompt.installAnyway")}
          </Button>
          <Button ref={safeChoice} onClick={() => prompt?.answer(false)}>
            {t("safety.prompt.dontInstall")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
