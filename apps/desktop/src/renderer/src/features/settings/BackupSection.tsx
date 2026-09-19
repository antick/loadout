import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
import { SettingRow } from "@/components/SettingRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSetting } from "@/hooks/queries/settings";
import { toastSuccess } from "@/lib/toast";

function ClientIdForm({ saved }: { saved: string }): ReactNode {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState(saved);
  const setSetting = useSetSetting();
  const value = draft.trim();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSetting.mutate(
      { key: "githubClientId", value },
      { onSuccess: () => toastSuccess(t("settings.backup.clientIdSaved")) },
    );
  };

  return (
    <SettingRow
      stacked
      label={t("settings.backup.clientId")}
      description={t("settings.backup.clientIdHint")}
      htmlFor={inputId}
    >
      <form onSubmit={submit} className="flex w-full max-w-xl gap-2">
        <Input
          id={inputId}
          value={draft}
          spellCheck={false}
          placeholder={t("settings.backup.clientIdPlaceholder")}
          className="font-mono text-sm"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={value === saved || setSetting.isPending}>
          {t("common.save")}
        </Button>
      </form>
    </SettingRow>
  );
}

/** Backup options that are settings rather than actions; the actions live on the Backup page. */
export function BackupSection(): ReactNode {
  const { t } = useTranslation();
  const mergeId = useId();
  const skillAwareMerge = useSetting("skillAwareMerge");
  const clientId = useSetting("githubClientId");
  const setSetting = useSetSetting();

  return (
    <Panel
      title={t("settings.backup.title")}
      description={t("settings.backup.description")}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/backup">
            {t("settings.backup.open")}
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col divide-y">
        <SettingRow
          label={t("settings.backup.merge")}
          description={t("settings.backup.mergeHint")}
          htmlFor={mergeId}
        >
          <Switch
            id={mergeId}
            checked={skillAwareMerge}
            onCheckedChange={(value) => setSetting.mutate({ key: "skillAwareMerge", value })}
          />
        </SettingRow>
        <ClientIdForm key={clientId} saved={clientId} />
      </div>
    </Panel>
  );
}
