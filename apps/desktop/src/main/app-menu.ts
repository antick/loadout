import type { MenuItemConstructorOptions } from "electron";
import { APP_NAME } from "@loadout/shared";

export interface AppMenuOptions {
  /** `process.platform`: macOS gets its app menu and window roles, the others leave them out. */
  platform: NodeJS.Platform;
  /** A release build: no reload and no developer tools. */
  packaged: boolean;
}

export const APP_MENU_LABELS = {
  edit: "Edit",
  view: "View",
  window: "Window",
} as const;

const SEPARATOR: MenuItemConstructorOptions = { type: "separator" };

/**
 * The application menu, replacing Electron's default one (which reloads the page and opens the
 * developer tools in release builds too). Text fields need the Edit roles for their shortcuts on
 * macOS, and the text size follows the View zoom roles. Pure, so it can be tested without Electron.
 */
export function buildAppMenu({ platform, packaged }: AppMenuOptions): MenuItemConstructorOptions[] {
  const mac = platform === "darwin";
  const appMenu: MenuItemConstructorOptions[] = mac
    ? [
        {
          label: APP_NAME,
          submenu: [
            { role: "about" },
            SEPARATOR,
            { role: "services" },
            SEPARATOR,
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            SEPARATOR,
            { role: "quit" },
          ],
        },
      ]
    : [];
  const developer: MenuItemConstructorOptions[] = packaged
    ? []
    : [SEPARATOR, { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }];
  const windowItems: MenuItemConstructorOptions[] = mac
    ? [
        { role: "minimize" },
        { role: "zoom" },
        SEPARATOR,
        { role: "front" },
        SEPARATOR,
        { role: "close" },
      ]
    : [{ role: "minimize" }, { role: "close" }, SEPARATOR, { role: "quit" }];

  return [
    ...appMenu,
    {
      label: APP_MENU_LABELS.edit,
      submenu: [
        { role: "undo" },
        { role: "redo" },
        SEPARATOR,
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(mac ? [{ role: "pasteAndMatchStyle" } as const] : []),
        { role: "delete" },
        SEPARATOR,
        { role: "selectAll" },
      ],
    },
    {
      label: APP_MENU_LABELS.view,
      submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, ...developer],
    },
    { label: APP_MENU_LABELS.window, role: "windowMenu", submenu: windowItems },
  ];
}
