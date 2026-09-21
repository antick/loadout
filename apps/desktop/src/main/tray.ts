import { join } from "node:path";
import { Menu, Tray, nativeImage } from "electron";
import { APP_NAME } from "@loadout/shared";

export interface TrayActions {
  show(): void;
  navigate(to: string): void;
  quit(): void;
}

const TRAY_ICON_SIZE = 18;

/** System tray icon with Show / quick links / Quit. Returns a disposer. */
export function createTray(resourcesDir: string, actions: TrayActions): () => void {
  const image = nativeImage
    .createFromPath(join(resourcesDir, "trayTemplate.png"))
    .resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
  image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Show ${APP_NAME}`, click: actions.show },
      { type: "separator" },
      { label: "Library", click: () => actions.navigate("/library") },
      { label: "Install skills", click: () => actions.navigate("/install") },
      { label: "Backup", click: () => actions.navigate("/backup") },
      { type: "separator" },
      { label: "Quit", click: actions.quit },
    ]),
  );
  tray.on("click", actions.show);
  return () => tray.destroy();
}
