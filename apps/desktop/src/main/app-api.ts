import { homedir } from "node:os";
import { type BrowserWindow, app, clipboard, dialog, session, shell } from "electron";
import { APP_NAME, type AppApi, type Platform, type RemoveAllDataOptions } from "@loadout/shared";
import { ARCHIVE_EXTENSIONS } from "./constants";
import { checkForUpdate } from "./updater";

export interface AppApiDeps {
  window(): BrowserWindow | null;
  quit(): void;
  hideToTray(): void;
  resolveClose(action: "hide" | "quit", remember: boolean): void;
  /** Clean agent folders, close the library, start the clean-up process and exit. */
  removeAllData(options: RemoveAllDataOptions): Promise<void>;
}

/** The part of the API only Electron can provide: dialogs, shell, clipboard, app lifecycle. */
export function createAppApi(deps: AppApiDeps): AppApi {
  const pick = async (options: Electron.OpenDialogOptions): Promise<string | null> => {
    const win = deps.window();
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };

  return {
    info: async () => ({
      name: APP_NAME,
      version: app.getVersion(),
      platform: process.platform as Platform,
      homeDir: homedir(),
    }),
    pickFolder: (title) => pick({ title, properties: ["openDirectory", "createDirectory"] }),
    pickArchive: () =>
      pick({
        properties: ["openFile"],
        filters: [{ name: "Skill archives", extensions: ARCHIVE_EXTENSIONS }],
      }),
    openExternal: async (url) => {
      if (!/^https?:\/\//i.test(url)) throw new Error("Only web links can be opened");
      await shell.openExternal(url);
    },
    revealPath: async (path) => {
      const failure = await shell.openPath(path);
      if (failure) shell.showItemInFolder(path);
    },
    copyText: async (text) => clipboard.writeText(text),
    checkUpdate: () => checkForUpdate(),
    quit: async () => deps.quit(),
    hideToTray: async () => deps.hideToTray(),
    restart: async () => {
      app.relaunch();
      deps.quit();
    },
    resolveClose: async (action, remember) => deps.resolveClose(action, remember),
    clearAppCache: async () => {
      const web = session.defaultSession;
      await web.clearCache();
      await web.clearCodeCaches({});
      await web.clearStorageData({ storages: ["shadercache", "cachestorage", "serviceworkers"] });
    },
    removeAllData: (options) => deps.removeAllData(options),
  };
}
