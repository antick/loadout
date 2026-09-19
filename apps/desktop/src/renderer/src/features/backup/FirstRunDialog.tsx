import { CloudDownload, Sparkles, TerminalSquare } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRestoreFromRemote } from "@/hooks/mutations/backup-page";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useBackupStatus } from "@/hooks/queries/app";
import { useSettings } from "@/hooks/queries/settings";
import { useSkills } from "@/hooks/queries/skills";
import { backupErrorText } from "@/lib/backup-errors";

/**
 * Asked once, on a brand-new library: start empty, or bring the library over from a backup.
 * Mounted by the shell; it decides for itself whether to show.
 */
export function FirstRunDialog(): ReactNode {
  const { t } = useTranslation();
  const urlId = useId();
  const skills = useSkills();
  const settings = useSettings();
  const status = useBackupStatus();
  const setSetting = useSetSetting();
  const restore = useRestoreFromRemote();
  const [url, setUrl] = useState("");
  const [closed, setClosed] = useState(false);

  const untouched =
    skills.data?.length === 0 &&
    settings.data?.backupFirstRunPrompt === "" &&
    status.data !== undefined &&
    !status.data.isRepo &&
    status.data.remoteUrl === null;
  // Stay up while a restore runs, even though the first restored skill ends "untouched".
  const open = !closed && (untouched || restore.isPending || restore.isError);
  const gitMissing = status.data?.gitAvailable === false;

  const startFresh = (): void => {
    setSetting.mutate({ key: "backupFirstRunPrompt", value: "fresh" });
    setClosed(true);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const remote = url.trim();
    if (!remote) return;
    restore.mutate(remote, {
      onSuccess: () => {
        setSetting.mutate({ key: "backupFirstRunPrompt", value: "restored" });
        setClosed(true);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next && !restore.isPending ? setClosed(true) : undefined)}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{t("backupPage.firstRun.title")}</DialogTitle>
            <DialogDescription>{t("backupPage.firstRun.description")}</DialogDescription>
          </DialogHeader>
          {gitMissing ? (
            <InlineNotice tone="warning" icon={TerminalSquare}>
              {t("backupPage.errors.GIT_MISSING")}
            </InlineNotice>
          ) : null}
          <Field data-invalid={restore.isError || undefined}>
            <FieldLabel htmlFor={urlId}>{t("backupPage.firstRun.urlLabel")}</FieldLabel>
            <Input
              id={urlId}
              value={url}
              spellCheck={false}
              aria-invalid={restore.isError}
              placeholder={t("backupPage.remote.placeholder")}
              className="font-mono text-sm"
              disabled={restore.isPending}
              onChange={(event) => setUrl(event.target.value)}
            />
            {restore.isError ? (
              <FieldError data-selectable>{backupErrorText(restore.error, t)}</FieldError>
            ) : (
              <FieldDescription>{t("backupPage.firstRun.urlHint")}</FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={restore.isPending} onClick={startFresh}>
              <Sparkles />
              {t("backupPage.firstRun.fresh")}
            </Button>
            <Button type="submit" disabled={!url.trim() || restore.isPending || gitMissing}>
              {restore.isPending ? <Spinner /> : <CloudDownload />}
              {t("backupPage.firstRun.restore")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
