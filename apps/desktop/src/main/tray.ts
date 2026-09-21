import { join } from "node:path";
import { Menu, Tray, nativeImage } from "electron";
import { APP_NAME } from "@loadout/shared";
import { type TrayActions, type TrayState, buildTrayMenu } from "./tray-menu";

export interface TrayHandle {
  /** Rebuild the menu for a new state. */
  update(state: TrayState): void;
  dispose(): void;
}

const TRAY_ICON_SIZE = 18;

/** System tray icon whose menu is rebuilt from `update`. */
export function createTray(
  resourcesDir: string,
  initial: TrayState,
  actions: TrayActions,
): TrayHandle {
  const image = nativeImage
    .createFromPath(join(resourcesDir, "trayTemplate.png"))
    .resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
  image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  const update = (state: TrayState): void =>
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu(state, actions)));
  update(initial);
  tray.on("click", actions.show);
  return { update, dispose: () => tray.destroy() };
}
