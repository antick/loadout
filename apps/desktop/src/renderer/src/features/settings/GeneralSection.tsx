import type { CloseActionSetting, DeployMode } from "@skillboard/shared";
import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { type Choice, ChoiceCards } from "@/components/ChoiceCards";
import { OptionSelect } from "@/components/OptionSelect";
import { Panel } from "@/components/Panel";
import { SettingRow } from "@/components/SettingRow";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSettings } from "@/hooks/queries/settings";
import { LANGUAGES } from "@/lib/i18n";
import { CLOSE_ACTIONS, DEPLOY_MODES, TEXT_SIZE_OPTIONS, THEME_OPTIONS } from "./constants";
import { LibraryLocationCard } from "./LibraryLocationCard";

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Library location, how skills are installed, appearance, and what closing the window does. */
export function GeneralSection(): ReactNode {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const setSetting = useSetSetting();
  const textSizeId = useId();
  const languageId = useId();
  const trayId = useId();
  if (!settings) return null;

  const deployChoices: Choice<DeployMode>[] = DEPLOY_MODES.map((mode) => ({
    value: mode,
    title: t(`settings.general.deploy.${mode}.title`),
    description: t(`settings.general.deploy.${mode}.body`),
  }));
  const closeChoices: Choice<CloseActionSetting>[] = CLOSE_ACTIONS.map((action) => ({
    value: action,
    title: t(`settings.general.close.${action}`),
    description:
      action === "hide" && !settings.showTrayIcon
        ? t("settings.general.close.hideNeedsTray")
        : undefined,
    disabled: action === "hide" && !settings.showTrayIcon,
  }));

  const setTray = (on: boolean): void => {
    setSetting.mutate({ key: "showTrayIcon", value: on });
    // Without a tray icon a hidden window could never be brought back.
    if (!on && settings.closeAction === "hide") {
      setSetting.mutate({ key: "closeAction", value: "quit" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <LibraryLocationCard />

      <Panel
        title={t("settings.general.deploy.title")}
        description={t("settings.general.deploy.description")}
      >
        <ChoiceCards
          label={t("settings.general.deploy.title")}
          value={settings.deployMode}
          choices={deployChoices}
          className="md:grid-cols-2"
          onChange={(value) => setSetting.mutate({ key: "deployMode", value })}
        />
      </Panel>

      <Panel title={t("settings.general.appearance.title")}>
        <div className="flex flex-col divide-y">
          <SettingRow label={t("settings.general.appearance.theme")}>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={settings.theme}
              aria-label={t("settings.general.appearance.theme")}
              onValueChange={(next) => {
                const theme = THEME_OPTIONS.find((option) => option === next);
                if (theme) setSetting.mutate({ key: "theme", value: theme });
              }}
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = THEME_ICONS[option];
                return (
                  <ToggleGroupItem key={option} value={option} className="gap-1.5 px-2.5">
                    <Icon />
                    {t(`settings.general.appearance.themes.${option}`)}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </SettingRow>
          <SettingRow
            label={t("settings.general.appearance.textSize")}
            description={t("settings.general.appearance.textSizeHint")}
            htmlFor={textSizeId}
          >
            <OptionSelect
              id={textSizeId}
              value={settings.textSize}
              options={TEXT_SIZE_OPTIONS}
              labelOf={(size) => t(`settings.general.appearance.textSizes.${size}`)}
              onChange={(value) => setSetting.mutate({ key: "textSize", value })}
              className="w-36"
            />
          </SettingRow>
          <SettingRow label={t("settings.general.appearance.language")} htmlFor={languageId}>
            <OptionSelect
              id={languageId}
              value={
                LANGUAGES.some((entry) => entry.code === settings.language)
                  ? settings.language
                  : "en"
              }
              options={LANGUAGES.map((entry) => entry.code)}
              labelOf={(code) => LANGUAGES.find((entry) => entry.code === code)?.label ?? code}
              onChange={(value) => setSetting.mutate({ key: "language", value })}
              className="w-36"
            />
          </SettingRow>
        </div>
      </Panel>

      <Panel title={t("settings.general.window.title")}>
        <div className="flex flex-col divide-y">
          <SettingRow
            label={t("settings.general.window.tray")}
            description={t("settings.general.window.trayHint")}
            htmlFor={trayId}
          >
            <Switch id={trayId} checked={settings.showTrayIcon} onCheckedChange={setTray} />
          </SettingRow>
          <SettingRow
            stacked
            label={t("settings.general.close.title")}
            description={t("settings.general.close.description")}
          >
            <ChoiceCards
              label={t("settings.general.close.title")}
              value={settings.closeAction}
              choices={closeChoices}
              className="w-full md:grid-cols-3"
              onChange={(value) => setSetting.mutate({ key: "closeAction", value })}
            />
          </SettingRow>
        </div>
      </Panel>
    </div>
  );
}
