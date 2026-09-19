import { CircleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Panel } from "@/components/Panel";
import { Switch } from "@/components/ui/switch";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSetting } from "@/hooks/queries/settings";

/** The automatic backup switch, with the reason the last automatic round failed. */
export function AutoBackupCard(): ReactNode {
  const { t } = useTranslation();
  const switchId = useId();
  const enabled = useSetting("backupAutoEnabled");
  const lastError = useSetting("backupLastAutoError");
  const setSetting = useSetSetting();

  return (
    <Panel
      title={t("backupPage.auto.title")}
      description={t("backupPage.auto.description")}
      actions={
        <Switch
          id={switchId}
          checked={enabled}
          aria-label={t("backupPage.auto.title")}
          onCheckedChange={(value) => setSetting.mutate({ key: "backupAutoEnabled", value })}
        />
      }
    >
      {lastError ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          <span className="font-medium">{t("backupPage.auto.lastError")}</span>{" "}
          <span data-selectable>{lastError}</span>
        </InlineNotice>
      ) : null}
    </Panel>
  );
}
