import { formatRelative } from "@loadout/shared";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { OptionSelect } from "@/components/OptionSelect";
import { Panel } from "@/components/Panel";
import { SettingRow } from "@/components/SettingRow";
import { Switch } from "@/components/ui/switch";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSettings } from "@/hooks/queries/settings";
import { AUTO_UPDATE_INTERVALS, UPDATE_CHECK_TTL_OPTIONS } from "./constants";

/** How often skills are checked against their sources, and whether updates install themselves. */
export function UpdatesSection(): ReactNode {
  const { t } = useTranslation();
  // `updates:auto-ran` invalidates settings app-wide, so "last checked" refreshes by itself.
  const { data: settings } = useSettings();
  const setSetting = useSetSetting();
  const intervalId = useId();
  const applyId = useId();
  const ttlId = useId();
  if (!settings) return null;
  const off = settings.autoUpdateInterval === "off";
  // A value set outside this list (e.g. by an older build) is still shown rather than hidden.
  const ttl = String(settings.updateCheckTtlMinutes);
  const ttlOptions: readonly string[] = UPDATE_CHECK_TTL_OPTIONS.some((option) => option === ttl)
    ? UPDATE_CHECK_TTL_OPTIONS
    : [...UPDATE_CHECK_TTL_OPTIONS, ttl];

  return (
    <Panel title={t("settings.updates.title")} description={t("settings.updates.description")}>
      <div className="flex flex-col divide-y">
        <SettingRow
          label={t("settings.updates.frequency")}
          description={
            settings.autoUpdateLastRunAt
              ? t("settings.updates.lastChecked", {
                  when: formatRelative(settings.autoUpdateLastRunAt),
                })
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
          label={t("settings.updates.ttl")}
          description={t("settings.updates.ttlHint")}
          htmlFor={ttlId}
        >
          <OptionSelect
            id={ttlId}
            value={ttl}
            options={ttlOptions}
            labelOf={(option) =>
              UPDATE_CHECK_TTL_OPTIONS.some((known) => known === option)
                ? t(`settings.updates.ttlOptions.${option}`)
                : t("settings.updates.ttlMinutes", { count: Number(option) })
            }
            onChange={(value) =>
              setSetting.mutate({ key: "updateCheckTtlMinutes", value: Number(value) })
            }
            className="w-40"
          />
        </SettingRow>
      </div>
    </Panel>
  );
}
