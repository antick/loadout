import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, app, net, session, shell } from "electron";
import { type Core, createCore } from "@skillboard/core";
import { APP_ID, type SkillboardApi } from "@skillboard/shared";
import { createAppApi } from "./app-api";
import { SECRETS_FILE } from "./constants";
import { createEventSender, registerIpc } from "./ipc";
import { createSecretStore } from "./secrets";
import { createTray } from "./tray";
import { type LibraryWatcher, watchLibrary } from "./watcher";
import { createMainWindow, focusWindow } from "./window";

let mainWindow: BrowserWindow | null = null;
let core: Core | null = null;
let watcher: LibraryWatcher | null = null;
let disposeTray: (() => void) | null = null;
let quitting = false;

const resourcesDir = app.isPackaged
  ? join(process.resourcesPath, "resources")
  : join(import.meta.dirname, "../../resources");
const bundledCliPath = app.isPackaged
  ? join(process.resourcesPath, "cli", "skillboard.mjs")
  : join(import.meta.dirname, "../../../../packages/cli/dist/skillboard.mjs");

const send = createEventSender(() => BrowserWindow.getAllWindows());

function quit(): void {
  quitting = true;
  app.quit();
}

function hideToTray(): void {
  mainWindow?.hide();
  if (process.platform === "darwin") app.dock?.hide();
}

function showWindow(): void {
  if (process.platform === "darwin") void app.dock?.show();
  if (!mainWindow || mainWindow.isDestroyed()) openWindow();
  else focusWindow(mainWindow);
}

/** Route the app's own HTTP calls (marketplace, GitHub, update check) through the proxy setting. */
function syncProxy(): void {
  const proxyUrl = core?.ctx.settings.get("proxyUrl") ?? "";
  void session.defaultSession.setProxy(proxyUrl ? { proxyRules: proxyUrl } : { mode: "system" });
}

function syncTray(): void {
  const wanted = core?.ctx.settings.get("showTrayIcon") ?? true;
  if (wanted && !disposeTray) {
    disposeTray = createTray(resourcesDir, {
      show: showWindow,
      navigate: (to) => {
        showWindow();
        send("app:navigate", { to });
      },
      quit,
    });
  } else if (!wanted && disposeTray) {
    disposeTray();
    disposeTray = null;
  }
}

/** The close button asks, hides or quits depending on the saved choice. */
function handleClose(event: Electron.Event): void {
  if (quitting || !core) return;
  const trayVisible = core.ctx.settings.get("showTrayIcon");
  const action = trayVisible ? core.ctx.settings.get("closeAction") : "quit";
  if (action === "quit") {
    quitting = true;
    return;
  }
  event.preventDefault();
  if (action === "hide") hideToTray();
  else send("window:close-requested", {});
}

function openWindow(): void {
  mainWindow = createMainWindow();
  mainWindow.on("close", handleClose);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function recordCrash(error: unknown): void {
  try {
    if (!core) return;
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    core.ctx.log.error("Unhandled failure in the main process", error);
    writeFileSync(core.ctx.paths.crashMarkerPath, JSON.stringify({ at: Date.now(), message }));
  } catch {
    // Nothing more can be done while crashing.
  }
}

function start(): void {
  core = createCore({
    secrets: createSecretStore(join(app.getPath("userData"), SECRETS_FILE)),
    emit: (event, payload) => {
      if (event === "data:changed") {
        watcher?.mute();
        if ((payload as { scope: string[] }).scope.includes("settings")) {
          syncTray();
          syncProxy();
        }
      }
      send(event, payload);
    },
    echoLogs: !app.isPackaged,
    // `net.fetch` honours the session proxy, which follows the proxy setting.
    fetchImpl: ((input, init) => net.fetch(input as string, init as RequestInit)) as typeof fetch,
    host: {
      appVersion: app.getVersion(),
      revealPath: async (path) => {
        const failure = await shell.openPath(path);
        if (failure) shell.showItemInFolder(path);
      },
      bundledSkillDir: existsSync(join(resourcesDir, "skills")) ? join(resourcesDir, "skills") : null,
      bundledCliPath: existsSync(bundledCliPath) ? bundledCliPath : null,
      nodeRunner: { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } },
      downloadsDir: app.getPath("downloads"),
    },
  });

  const api: SkillboardApi = {
    ...core.api,
    app: createAppApi({
      window: () => mainWindow,
      quit,
      hideToTray,
      resolveClose: (action, remember) => {
        if (remember) core?.ctx.settings.set("closeAction", action);
        if (action === "quit") quit();
        else hideToTray();
      },
    }),
  };
  registerIpc(api, (channel, error) => core?.ctx.log.error(`IPC ${channel} failed`, error));

  watcher = watchLibrary(
    () => (core ? core.watchPaths() : []),
    () => {
      core?.background.libraryChangedOnDisk();
      send("data:changed", { scope: ["skills", "agents", "presets", "projects", "backup"] });
    },
  );

  core.background.start();
  syncProxy();
  syncTray();
  openWindow();
}

process.on("uncaughtException", recordCrash);
process.on("unhandledRejection", recordCrash);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || quitting) quit();
  });
  app.on("before-quit", (event) => {
    quitting = true;
    if (!core) return;
    const closing = core;
    core = null;
    event.preventDefault();
    watcher?.stop();
    disposeTray?.();
    void closing.background
      .beforeQuit()
      .catch((error: unknown) => closing.ctx.log.warn("Backup on quit failed", error))
      .finally(() => {
        closing.close();
        app.quit();
      });
  });
  void app.whenReady().then(start);
}
