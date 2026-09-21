import { Notification } from "electron";
import type { Core } from "@loadout/core";
import type { ApplyResult } from "@loadout/shared";
import { TRAY_REFRESH_DEBOUNCE_MS } from "./constants";
import { type TrayHandle, createTray } from "./tray";
import type { TrayState } from "./tray-menu";

export interface TrayControllerDeps {
  resourcesDir: string;
  /** Null once the core has shut down. */
  api(): CoreApi | null;
  show(): void;
  navigate(to: string): void;
  quit(): void;
  warn(message: string, error: unknown): void;
}

export interface TrayController {
  /** Show or hide the tray icon. */
  setVisible(visible: boolean): void;
  /** Reload the menu's counts soon; calls within the debounce window are merged. */
  refresh(): void;
  dispose(): void;
}

type CoreApi = Core["api"];

const EMPTY_STATE: TrayState = {
  skillCount: 0,
  agentCount: 0,
  updateCount: 0,
  presets: [],
  checkingUpdates: false,
};

const PRESET_INCOMPLETE = {
  title: "Some skills were left alone",
  body: "Open the dashboard's recent activity to see which ones and why.",
} as const;

async function loadState(api: CoreApi, checkingUpdates: boolean): Promise<TrayState> {
  const [skills, agents, presets, status] = await Promise.all([
    api.skills.list(),
    api.agents.list(),
    api.presets.list(),
    api.presets.deployStatus(),
  ]);
  const progress = new Map(status.map((entry) => [entry.presetId, entry]));
  return {
    skillCount: skills.length,
    agentCount: agents.filter((agent) => agent.installed && agent.enabled).length,
    updateCount: skills.filter((skill) => skill.updateStatus === "update_available").length,
    presets: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      deployed: progress.get(preset.id)?.deployed ?? 0,
      total: progress.get(preset.id)?.total ?? 0,
    })),
    checkingUpdates,
  };
}

/** Owns the tray icon: keeps its menu in step with the library and runs its actions. */
export function createTrayController(deps: TrayControllerDeps): TrayController {
  let tray: TrayHandle | null = null;
  let checkingUpdates = false;
  let timer: NodeJS.Timeout | null = null;

  const reload = async (): Promise<void> => {
    const api = deps.api();
    if (!tray || !api) return;
    try {
      const state = await loadState(api, checkingUpdates);
      tray?.update(state);
    } catch (error) {
      deps.warn("Could not refresh the tray menu", error);
    }
  };

  const refresh = (): void => {
    if (!tray) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void reload();
    }, TRAY_REFRESH_DEBOUNCE_MS);
  };

  const reportIfIncomplete = (result: ApplyResult): void => {
    if (result.conflicts.length === 0 && result.failed.length === 0) return;
    if (!Notification.isSupported()) return;
    const note = new Notification(PRESET_INCOMPLETE);
    note.on("click", () => deps.navigate("/"));
    note.show();
  };

  const setPresetDeployed = async (presetId: string, deployed: boolean): Promise<void> => {
    const api = deps.api();
    if (!api) return;
    try {
      const result = deployed
        ? await api.presets.applyToDefault(presetId)
        : await api.presets.removeFromDefault(presetId);
      reportIfIncomplete(result);
    } catch (error) {
      deps.warn("Tray preset action failed", error);
    }
    refresh();
  };

  const checkUpdates = async (): Promise<void> => {
    const api = deps.api();
    if (!api || checkingUpdates) return;
    checkingUpdates = true;
    void reload();
    try {
      await api.updates.checkAll(true);
    } catch (error) {
      deps.warn("Tray update check failed", error);
    } finally {
      checkingUpdates = false;
      void reload();
    }
  };

  const setVisible = (visible: boolean): void => {
    if (visible && !tray) {
      tray = createTray(deps.resourcesDir, EMPTY_STATE, {
        show: deps.show,
        navigate: deps.navigate,
        quit: deps.quit,
        setPresetDeployed: (id, deployed) => void setPresetDeployed(id, deployed),
        checkUpdates: () => void checkUpdates(),
        openLibraryFolder: () => void deps.api()?.system.revealLibrary(),
      });
      void reload();
    } else if (!visible && tray) {
      tray.dispose();
      tray = null;
    }
  };

  return {
    setVisible,
    refresh,
    dispose: () => {
      if (timer) clearTimeout(timer);
      setVisible(false);
    },
  };
}
