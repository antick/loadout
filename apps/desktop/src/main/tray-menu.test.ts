import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  TRAY_LABELS,
  TRAY_ROUTES,
  type TrayActions,
  type TrayState,
  buildTrayMenu,
} from "./tray-menu";

const STATE: TrayState = {
  skillCount: 7,
  agentCount: 1,
  updateCount: 2,
  checkingUpdates: false,
  presets: [
    { id: "full", name: "Frontend", deployed: 4, total: 4 },
    { id: "part", name: "Backend", deployed: 1, total: 3 },
    { id: "none", name: "Writing", deployed: 0, total: 2 },
    { id: "empty", name: "Empty", deployed: 0, total: 0 },
  ],
};

function actions(): TrayActions {
  return {
    show: vi.fn(),
    navigate: vi.fn(),
    setPresetDeployed: vi.fn(),
    checkUpdates: vi.fn(),
    openLibraryFolder: vi.fn(),
    quit: vi.fn(),
  };
}

const find = (menu: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions => {
  const item = menu.find((entry) => entry.label === label);
  if (!item) throw new Error(`No menu item "${label}"`);
  return item;
};

const click = (item: MenuItemConstructorOptions): void =>
  (item.click as () => void | undefined)?.();

const presetsOf = (menu: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
  find(menu, TRAY_LABELS.presets).submenu as MenuItemConstructorOptions[];

describe("tray menu", () => {
  it("leads with the counts and links pending updates to the filtered library", () => {
    const run = actions();
    const menu = buildTrayMenu(STATE, run);
    expect(menu[0]).toMatchObject({ label: "7 skills · 1 agent", enabled: false });
    click(find(menu, "2 skill updates available"));
    expect(run.navigate).toHaveBeenCalledWith(TRAY_ROUTES.updates);

    const none = buildTrayMenu({ ...STATE, updateCount: 0 }, run);
    expect(none.some((item) => String(item.label).includes("available"))).toBe(false);
  });

  it("ticks deployed presets, shows progress on partial ones and hides empty ones", () => {
    const run = actions();
    const items = presetsOf(buildTrayMenu(STATE, run));
    expect(items.map((item) => [item.label, item.checked])).toEqual([
      ["Frontend", true],
      ["Backend (1/3)", false],
      ["Writing", false],
    ]);
    items.forEach(click);
    expect(vi.mocked(run.setPresetDeployed).mock.calls).toEqual([
      ["full", false],
      ["part", true],
      ["none", true],
    ]);
  });

  it("explains an empty presets submenu", () => {
    const run = actions();
    expect(presetsOf(buildTrayMenu({ ...STATE, agentCount: 0 }, run))).toEqual([
      { label: TRAY_LABELS.noAgents, enabled: false },
    ]);
    expect(presetsOf(buildTrayMenu({ ...STATE, presets: [] }, run))).toEqual([
      { label: TRAY_LABELS.noPresets, enabled: false },
    ]);
  });

  it("runs the update check and folder actions, and greys the check while it runs", () => {
    const run = actions();
    const menu = buildTrayMenu(STATE, run);
    click(find(menu, TRAY_LABELS.checkUpdates));
    click(find(menu, TRAY_LABELS.openLibraryFolder));
    expect(run.checkUpdates).toHaveBeenCalledOnce();
    expect(run.openLibraryFolder).toHaveBeenCalledOnce();

    const busy = buildTrayMenu({ ...STATE, checkingUpdates: true }, run);
    expect(find(busy, TRAY_LABELS.checkingUpdates).enabled).toBe(false);
    expect(busy.some((item) => item.label === TRAY_LABELS.checkUpdates)).toBe(false);
  });
});
