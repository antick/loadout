import { homedir } from "node:os";
import { join } from "node:path";
import { type BrowserWindow, app, clipboard, dialog, session, shell } from "electron";
import { APP_NAME, type AppApi, type Platform, type RemoveAllDataOptions } from "@loadout/shared";
import { ARCHIVE_EXTENSIONS, EXPORT_EXTENSION } from "./constants";
import { revealInFileManager } from "./reveal";
import type { UpdateService } from "./update/service";

export interface AppApiDeps {
  window(): BrowserWindow | null;
  quit(): void;
  hideToTray(): void;
  resolveClose(action: "hide" | "quit", remember: boolean): void;
  /** Clean agent folders, close the library, start the clean-up process and exit. */
  removeAllData(options: RemoveAllDataOptions): Promise<void>;
  updates: UpdateService;
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
    pickSavePath: async (defaultName, title) => {
      const options: Electron.SaveDialogOptions = {
        title,
        defaultPath: join(app.getPath("downloads"), defaultName),
        filters: [{ name: "Zip archives", extensions: [EXPORT_EXTENSION] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      };
      const win = deps.window();
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    openExternal: async (url) => {
      if (!/^https?:\/\//i.test(url)) throw new Error("Only web links can be opened");
      await shell.openExternal(url);
    },
    revealPath: revealInFileManager,
    copyText: async (text) => clipboard.writeText(text),
    updateStatus: async () => deps.updates.status(),
    checkUpdate: () => deps.updates.check(),
    downloadUpdate: () => deps.updates.download(),
    cancelUpdate: async () => deps.updates.cancel(),
    installUpdate: () => deps.updates.install(),
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
