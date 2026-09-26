import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BrowserWindow, app, session, shell } from "electron";
import { AppError, type Core, createCore } from "@loadout/core";
import {
  APP_DATA_DIR_NAME,
  APP_ID,
  APP_NAME,
  DEV_APP_DATA_DIR_NAME,
  LIBRARY_DIR_NAME,
  type LoadoutApi,
  type RemoveAllDataOptions,
  UPDATE_FEED_PUBLIC_KEY,
  UPDATE_FEED_URL,
} from "@loadout/shared";
import { createAppApi } from "./app-api";
import { type AppDataMove, adoptAppData, removeOldAppData } from "./app-data";
import { startRemoval } from "./remover";
import { revealInFileManager } from "./reveal";
import {
  APP_ICON_FILE,
  CRASH_DUMPS_DIR,
  SECRETS_FILE,
  UPDATES_DIR,
  UPDATE_CHECK_DELAY_MS,
  UPDATE_FEED_OVERRIDE_ENV,
  UPDATE_RECHECK_MS,
} from "./constants";
import { createEventSender, registerIpc } from "./ipc";
import { createSecretStore } from "./secrets";
import { type TrayController, createTrayController } from "./tray-controller";
import { appFetch } from "./net-fetch";
import { locateApp } from "./update/locate";
import { type UpdateService, createUpdateService } from "./update/service";
import { type FolderWatcher, watchFolders } from "./watcher";
import { createMainWindow, focusWindow, isAppPage } from "./window";

let mainWindow: BrowserWindow | null = null;
let core: Core | null = null;
/** The library and agents' folders, then projects' skills folders. */
let watchers: FolderWatcher[] = [];
let tray: TrayController | null = null;
let quitting = false;
/** The library was deleted while running: nothing may write to it any more. */
let libraryGone = false;
let updateTimer: NodeJS.Timeout | null = null;

const resourcesDir = app.isPackaged
  ? join(process.resourcesPath, "resources")
  : join(import.meta.dirname, "../../resources");
const appIconPath = join(resourcesDir, APP_ICON_FILE);
const bundledCliPath = app.isPackaged
  ? join(process.resourcesPath, "cli", "loadout.mjs")
  : join(import.meta.dirname, "../../../../packages/cli/dist/loadout.mjs");

const send = createEventSender(() => BrowserWindow.getAllWindows());

// The app's own files live in the home data folder next to the library, not in the OS app data
// folder. Set before anything reads the path (the single-instance lock does).
const legacyAppDataDir = app.getPath("userData");
// The name macOS shows in the app menu (About, Hide, Quit). Without it Electron uses the package
// name. Set after reading the old data folder above, which was named the old way.
app.setName(APP_NAME);
const appDataDir = join(
  homedir(),
  LIBRARY_DIR_NAME,
  app.isPackaged ? APP_DATA_DIR_NAME : DEV_APP_DATA_DIR_NAME,
);
app.setPath("userData", appDataDir);
app.setPath("crashDumps", join(appDataDir, CRASH_DUMPS_DIR));
let appDataMove: AppDataMove | null = null;

/** Report the one-time move of the app's files, and remove the old folder when it is safe. */
function finishAppDataMove(log: Core["ctx"]["log"]): void {
  for (const name of appDataMove?.copied ?? []) {
    log.info(`Moved ${name} from ${legacyAppDataDir} to ${appDataDir}`);
  }
  for (const failure of appDataMove?.failed ?? []) {
    log.warn(`Could not move ${failure.name} from ${legacyAppDataDir}: ${failure.message}`);
  }
  const outcome = removeOldAppData(legacyAppDataDir, appDataDir);
  if (outcome === "removed") log.info(`Removed the old app data folder ${legacyAppDataDir}`);
  else if (outcome !== "absent") log.warn(`Kept the old app data folder (${outcome})`);
}

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

/** Scopes whose changes alter a count or a preset shown in the tray menu. */
const TRAY_SCOPES: ReadonlySet<string> = new Set(["skills", "agents", "presets"]);

function navigateTo(to: string): void {
  showWindow();
  send("app:navigate", { to });
}

function syncTray(): void {
  tray ??= createTrayController({
    resourcesDir,
    api: () => core?.api ?? null,
    show: showWindow,
    navigate: navigateTo,
    quit,
    warn: (message, error) => core?.ctx.log.warn(message, error),
  });
  tray.setVisible(core?.ctx.settings.get("showTrayIcon") ?? true);
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

/**
 * Remove every file Loadout keeps and exit. Agent folders are cleaned while the library is still
 * open; the files go once the app is gone. No backup on the way out: there is nothing to keep.
 */
async function removeAllData(options: RemoveAllDataOptions): Promise<void> {
  if (!core) return;
  const closing = core;
  const plan = await closing.storage.prepareRemoval(options);
  closing.ctx.log.info(`Removing all data; ${plan.undeployed} deployments taken out of agents`);
  core = null;
  quitting = true;
  for (const watcher of watchers) watcher.stop();
  tray?.dispose();
  tray = null;
  closing.background.stop();
  closing.close();
  startRemoval(
    {
      pid: process.pid,
      paths: [...plan.paths, ...(existsSync(legacyAppDataDir) ? [legacyAppDataDir] : [])],
      emptyDirs: plan.emptyDirs,
      keychainService: process.platform === "darwin" ? `${app.getName()} Safe Storage` : null,
    },
    process.execPath,
  );
  app.exit(0);
}

/**
 * Is the library still there? When its folder or database was deleted, stop everything that
 * writes to it (watcher, background work, the backup on quit) and ask the user what to do. No
 * logging here: that would bring the logs folder back.
 */
function checkLibrary(): boolean {
  if (libraryGone) return false;
  if (!core || core.libraryPresent()) return true;
  libraryGone = true;
  for (const watcher of watchers) watcher.stop();
  watchers = [];
  core.background.stop();
  send("library:missing", { path: core.ctx.paths.baseDir });
  return false;
}

function openWindow(): void {
  mainWindow = createMainWindow(appIconPath);
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

/** Self-update: a published build checks the release feed; a development build only a test feed. */
function createUpdates(log: Core["ctx"]["log"], logsDir: string): UpdateService {
  // A test feed is for development builds only; a published build always reads the real one.
  const override = app.isPackaged ? undefined : process.env[UPDATE_FEED_OVERRIDE_ENV];
  const updates = createUpdateService({
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    location: locateApp({
      platform: process.platform,
      execPath: process.execPath,
      appImage: process.env.APPIMAGE,
      packaged: app.isPackaged,
    }),
    feedUrl: override || (app.isPackaged ? UPDATE_FEED_URL : null),
    // Only a development build's test feed goes unsigned.
    feedPublicKey: override ? null : UPDATE_FEED_PUBLIC_KEY,
    updatesDir: join(appDataDir, UPDATES_DIR),
    logsDir,
    fetchImpl: appFetch,
    emit: (status) => send("app-update:status", status),
    quit,
    openPath: (path) => shell.openPath(path),
    log,
  });
  const checkQuietly = (): void => {
    const phase = updates.status().phase;
    if (phase === "downloading" || phase === "ready" || phase === "installing") return;
    void updates.check();
  };
  void updates
    .start()
    .catch((error: unknown) => log.warn("Could not read earlier update downloads", error))
    .finally(() => {
      updateTimer = setTimeout(() => {
        checkQuietly();
        updateTimer = setInterval(checkQuietly, UPDATE_RECHECK_MS);
      }, UPDATE_CHECK_DELAY_MS);
    });
  return updates;
}

function start(): void {
  app.dock?.setIcon(appIconPath);
  // The app uses no browser permissions (camera, location, page notifications): refuse them all.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, answer) =>
    answer(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  core = createCore({
    secrets: createSecretStore(join(app.getPath("userData"), SECRETS_FILE)),
    emit: (event, payload) => {
      if (event === "data:changed") {
        for (const watcher of watchers) watcher.mute();
        const { scope } = payload as { scope: string[] };
        if (scope.includes("settings")) {
          syncTray();
          syncProxy();
        }
        if (scope.some((entry) => TRAY_SCOPES.has(entry))) tray?.refresh();
      }
      if (event === "updates:auto-ran") tray?.refresh();
      send(event, payload);
    },
    echoLogs: !app.isPackaged,
    fetchImpl: appFetch,
    host: {
      appVersion: app.getVersion(),
      revealPath: revealInFileManager,
      bundledSkillDir: existsSync(join(resourcesDir, "skills"))
        ? join(resourcesDir, "skills")
        : null,
      bundledCliPath: existsSync(bundledCliPath) ? bundledCliPath : null,
      nodeRunner: { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } },
      downloadsDir: app.getPath("downloads"),
      appDataDir,
    },
  });

  const api: LoadoutApi = {
    ...core.api,
    app: createAppApi({
      window: () => mainWindow,
      quit,
      hideToTray,
      removeAllData,
      updates: createUpdates(core.ctx.log, core.ctx.paths.logsDir),
      resolveClose: (action, remember) => {
        if (remember) core?.ctx.settings.set("closeAction", action);
        if (action === "quit") quit();
        else hideToTray();
      },
    }),
  };
  registerIpc(
    api,
    (channel, error) => core?.ctx.log.error(`IPC ${channel} failed`, error),
    // A deleted library must not come back through a late request; only the app itself answers.
    (namespace) =>
      libraryGone && namespace !== "app"
        ? new AppError("UNSUPPORTED", "The library was deleted. Restart or quit.")
        : null,
    isAppPage,
  );

  watchers = [
    watchFolders(
      () => (core ? core.watchPaths() : []),
      () => {
        if (!checkLibrary()) return;
        core?.background.libraryChangedOnDisk();
        send("data:changed", { scope: ["skills", "agents", "presets", "projects", "backup"] });
        tray?.refresh();
      },
    ),
    watchFolders(
      () => (core ? core.projectWatchPaths() : []),
      () => {
        if (checkLibrary()) send("data:changed", { scope: ["projects"] });
      },
    ),
  ];

  // After the library started: it adopts the location file the old folder may still hold.
  finishAppDataMove(core.ctx.log);
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
  appDataMove = adoptAppData(legacyAppDataDir, appDataDir);
  app.setAppUserModelId(APP_ID);
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("browser-window-focus", () => void checkLibrary());
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || quitting) quit();
  });
  app.on("before-quit", (event) => {
    quitting = true;
    if (updateTimer) clearTimeout(updateTimer);
    if (!core) return;
    const closing = core;
    core = null;
    event.preventDefault();
    for (const watcher of watchers) watcher.stop();
    tray?.dispose();
    tray = null;
    if (libraryGone) {
      // Nothing to back up, and closing normally would write the metadata back.
      closing.abandon();
      app.quit();
      return;
    }
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
