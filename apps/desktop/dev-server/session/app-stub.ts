import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  APP_NAME,
  type AppApi,
  type AppUpdateStatus,
  type DetectedEditor,
  type Platform,
} from "@loadout/shared";
import type { World } from "./world.ts";

/** The version the preview reports; never mistaken for a release. */
export const PREVIEW_VERSION = "0.0.0-preview";
/** Editors the preview pretends to find, so the editor choice has something to pick. */
const PREVIEW_EDITORS: DetectedEditor[] = [
  { id: "vscode", name: "Visual Studio Code" },
  { id: "cursor", name: "Cursor" },
];
/** The folder a "pick a folder" dialog answers with, under the fake home. */
const PICKED_FOLDER = ["code", "new-project"];
const IDLE_UPDATE: AppUpdateStatus = {
  phase: "idle",
  currentVersion: PREVIEW_VERSION,
  latestVersion: null,
  releaseUrl: "https://example.com/releases",
  method: "replace",
  blocker: "not_configured",
  progress: null,
  checkedAt: null,
  error: null,
  lastInstall: null,
};

const nothing = async (): Promise<void> => undefined;
const update = async (): Promise<AppUpdateStatus> => IDLE_UPDATE;

/**
 * The Electron-only part of the API (`main/app-api.ts`) for a browser: dialogs answer with a
 * fixed place in the fake home, the shell and window calls do nothing, updates never come.
 */
export function createAppStub(world: World): AppApi {
  return {
    info: async () => ({
      name: APP_NAME,
      version: PREVIEW_VERSION,
      platform: process.platform as Platform,
      homeDir: world.home,
    }),
    pickFolder: async () => {
      const folder = join(world.home, ...PICKED_FOLDER);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
    pickArchive: async () => null,
    pickFile: async () => null,
    pickSavePath: async (defaultName) => join(world.home, "Downloads", defaultName),
    openExternal: nothing,
    revealPath: nothing,
    editors: async () => PREVIEW_EDITORS,
    openInEditor: nothing,
    copyText: nothing,
    updateStatus: update,
    checkUpdate: update,
    downloadUpdate: update,
    cancelUpdate: update,
    installUpdate: nothing,
    quit: nothing,
    restart: nothing,
    clearAppCache: nothing,
    removeAllData: nothing,
    acknowledgeClose: async () => true,
    resolveClose: nothing,
  };
}
