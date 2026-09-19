import { ChevronRight } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSetBackupRemote } from "@/hooks/mutations/backup-page";

export interface RemoteUrlPanelProps {
  /** The remote in use, already free of credentials. */
  currentUrl: string | null;
  /** Called with the URL as the backend stored it. */
  onSaved: (cleanUrl: string) => void;
}

/** Advanced: back up to any Git remote (self-hosted, SSH, another provider). */
export function RemoteUrlPanel({ currentUrl, onSaved }: RemoteUrlPanelProps): ReactNode {
  const { t } = useTranslation();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(currentUrl ?? "");
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const save = useSetBackupRemote();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    save.mutate(value, {
      onSuccess: (clean) => {
        // Show what was stored: credentials typed into the URL moved to the keychain.
        setUrl(clean);
        setSavedAs(clean);
        onSaved(clean);
      },
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group/advanced flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-data-[state=open]/advanced:rotate-90" />
        {t("backupPage.remote.title")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form onSubmit={submit} className="flex flex-col gap-2 px-4 pb-4">
          <label htmlFor={inputId} className="text-sm text-muted-foreground">
            {t("backupPage.remote.description")}
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={url}
              spellCheck={false}
              placeholder={t("backupPage.remote.placeholder")}
              className="font-mono text-sm"
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!url.trim() || save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {t("common.save")}
            </Button>
          </div>
          {savedAs ? (
            <p className="text-xs text-muted-foreground">
              {t("backupPage.remote.savedAs")}{" "}
              <span data-selectable className="font-mono">
                {savedAs}
              </span>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("backupPage.remote.credentialsHint")}</p>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
