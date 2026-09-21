import type { MenuItemConstructorOptions } from "electron";
import { APP_NAME } from "@loadout/shared";

/** What the tray menu shows. Rebuilt whenever the library, agents or presets change. */
export interface TrayState {
  skillCount: number;
  /** Agents that are installed and enabled, so they can receive skills. */
  agentCount: number;
  updateCount: number;
  presets: readonly TrayPreset[];
  checkingUpdates: boolean;
}

export interface TrayPreset {
  id: string;
  name: string;
  /** Skill × agent pairs deployed now, out of `total` wanted. */
  deployed: number;
  total: number;
}

export interface TrayActions {
  show(): void;
  navigate(to: string): void;
  /** Deploy the preset to every enabled agent (`true`) or remove it from them (`false`). */
  setPresetDeployed(presetId: string, deployed: boolean): void;
  checkUpdates(): void;
  openLibraryFolder(): void;
  quit(): void;
}

export const TRAY_ROUTES = {
  library: "/library",
  updates: "/library?status=updates",
  install: "/install",
  backup: "/backup",
} as const;

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const TRAY_LABELS = {
  status: (skills: number, agents: number): string =>
    `${plural(skills, "skill", "skills")} · ${plural(agents, "agent", "agents")}`,
  updates: (count: number): string => `${plural(count, "skill update", "skill updates")} available`,
  presets: "Presets",
  noAgents: "No agents enabled",
  noPresets: "No presets with skills",
  partialPreset: (name: string, deployed: number, total: number): string =>
    `${name} (${deployed}/${total})`,
  show: `Show ${APP_NAME}`,
  library: "Library",
  install: "Install skills",
  backup: "Backup",
  checkUpdates: "Check for skill updates",
  checkingUpdates: "Checking for skill updates…",
  openLibraryFolder: "Open library folder",
  quit: "Quit",
} as const;

function presetItems(state: TrayState, actions: TrayActions): MenuItemConstructorOptions[] {
  if (state.agentCount === 0) return [{ label: TRAY_LABELS.noAgents, enabled: false }];
  const usable = state.presets.filter((preset) => preset.total > 0);
  if (usable.length === 0) return [{ label: TRAY_LABELS.noPresets, enabled: false }];
  return usable.map((preset) => {
    const active = preset.deployed === preset.total;
    const partial = preset.deployed > 0 && !active;
    return {
      label: partial
        ? TRAY_LABELS.partialPreset(preset.name, preset.deployed, preset.total)
        : preset.name,
      type: "checkbox",
      checked: active,
      // A partly deployed preset is completed first; a second click removes it.
      click: () => actions.setPresetDeployed(preset.id, !active),
    };
  });
}

/** The tray's context menu for a state. Pure, so it can be tested without Electron. */
export function buildTrayMenu(
  state: TrayState,
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  const go = (to: string) => () => actions.navigate(to);
  const updates: MenuItemConstructorOptions[] =
    state.updateCount > 0
      ? [{ label: TRAY_LABELS.updates(state.updateCount), click: go(TRAY_ROUTES.updates) }]
      : [];
  return [
    { label: TRAY_LABELS.status(state.skillCount, state.agentCount), enabled: false },
    ...updates,
    { type: "separator" },
    { label: TRAY_LABELS.presets, submenu: presetItems(state, actions) },
    { type: "separator" },
    { label: TRAY_LABELS.show, click: actions.show },
    { label: TRAY_LABELS.library, click: go(TRAY_ROUTES.library) },
    { label: TRAY_LABELS.install, click: go(TRAY_ROUTES.install) },
    { label: TRAY_LABELS.backup, click: go(TRAY_ROUTES.backup) },
    { type: "separator" },
    state.checkingUpdates
      ? { label: TRAY_LABELS.checkingUpdates, enabled: false }
      : { label: TRAY_LABELS.checkUpdates, click: actions.checkUpdates },
    { label: TRAY_LABELS.openLibraryFolder, click: actions.openLibraryFolder },
    { type: "separator" },
    { label: TRAY_LABELS.quit, click: actions.quit },
  ];
}
