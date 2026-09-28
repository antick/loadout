/** DEV ONLY. `settings.*` for the browser preview: the defaults, changed in memory. */
import { type DataScope, DEFAULT_SETTINGS, type Settings } from "@loadout/shared";

type Handler = (...args: never[]) => unknown;

let settings: Settings = { ...DEFAULT_SETTINGS };

export const getMockSettings = (): Settings => settings;

export function createSettingsMockHandlers(
  emitChanged: (...scope: DataScope[]) => void,
): Record<string, Handler> {
  return {
    "settings.all": () => settings,
    "settings.get": (key: keyof Settings) => settings[key],
    "settings.set": (key: keyof Settings, value: never) => {
      settings = { ...settings, [key]: value };
      emitChanged("settings");
    },
  };
}
