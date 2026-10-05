import { AUTO_UPDATE_INTERVALS, formatRelative } from "@loadout/shared";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { OptionSelect } from "@/components/OptionSelect";
import { Panel } from "@/components/Panel";
import { SettingRow } from "@/components/SettingRow";
import { Switch } from "@/components/ui/switch";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSettings } from "@/hooks/queries/settings";
import { useLastAutoUpdateRun } from "./settings-queries";

/** How often skills are checked against their sources, and whether updates install themselves. */
export function UpdatesSection(): ReactNode {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  // `updates:auto-ran` refreshes it app-wide, so "last checked" updates by itself.
  const lastRunAt = useLastAutoUpdateRun().data;
  const setSetting = useSetSetting();
  const intervalId = useId();
  const applyId = useId();
  const addNewId = useId();
  if (!settings) return null;
  const off = settings.autoUpdateInterval === "off";

  return (
    <Panel title={t("settings.updates.title")} description={t("settings.updates.description")}>
      <div className="flex flex-col divide-y">
        <SettingRow
          label={t("settings.updates.frequency")}
          description={
            lastRunAt
              ? t("settings.updates.lastChecked", { when: formatRelative(lastRunAt) })
              : t("settings.updates.neverChecked")
          }
          htmlFor={intervalId}
        >
          <OptionSelect
            id={intervalId}
            value={settings.autoUpdateInterval}
            options={AUTO_UPDATE_INTERVALS}
            labelOf={(interval) => t(`settings.updates.intervals.${interval}`)}
            onChange={(value) => setSetting.mutate({ key: "autoUpdateInterval", value })}
            className="w-40"
          />
        </SettingRow>
        <SettingRow
          label={t("settings.updates.apply")}
          description={t("settings.updates.applyHint")}
          htmlFor={applyId}
        >
          <Switch
            id={applyId}
            checked={settings.autoUpdateApply && !off}
            disabled={off}
            onCheckedChange={(value) => setSetting.mutate({ key: "autoUpdateApply", value })}
          />
        </SettingRow>
        <SettingRow
          label={t("settings.updates.addNew")}
          description={t("settings.updates.addNewHint")}
          htmlFor={addNewId}
        >
          <Switch
            id={addNewId}
            checked={settings.autoAddNewSkills}
            onCheckedChange={(value) => setSetting.mutate({ key: "autoAddNewSkills", value })}
          />
        </SettingRow>
      </div>
    </Panel>
  );
}
