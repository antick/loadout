import { existsSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BrowserWindow, app, dialog, session, shell } from "electron";
import { AppError, type Core, createCore } from "@loadout/core";
import {
  AGENT_HOME_ENV_VARIABLES,
  APP_DATA_DIR_NAME,
  APP_RUNNING_FILE,
  APP_ID,
  APP_NAME,
  DEV_APP_DATA_DIR_NAME,
  LIBRARY_DIR_NAME,
  type LoadoutApi,
  type RemoveAllDataOptions,
  UPDATE_FEED_PUBLIC_KEY,
  UPDATE_FEED_URL,
  errorMessage,
} from "@loadout/shared";
import { createAppApi } from "./app-api";
import { closeOutcome, createCloseRequests, shouldReloadPage } from "./close-request";
import { createCrashHandlers } from "./crash";
import { keychainServiceToRemove, startRemoval } from "./remover";
import { revealInFileManager } from "./reveal";
import { readShellEnv } from "./shell-env";
import {
  APP_ICON_FILE,
  CLOSE_ACK_TIMEOUT_MS,
  CRASH_DUMPS_DIR,
  PAGE_RELOAD_MIN_INTERVAL_MS,
  SECRETS_FILE,
  UPDATES_DIR,
  UPDATE_CHECK_DELAY_MS,
  UPDATE_RECHECK_MS,
} from "./constants";
import { createEventSender, registerIpc } from "./ipc";
import { openCoreOrAsk } from "./library-unavailable";
import { nativeUnavailablePrompts } from "./library-unavailable-dialogs";
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
/** Agents' home folder variables as the login shell sets them; filled in shortly after start. */
let shellEnv: Record<string, string> = {};
/** When the window's page was last reloaded after its process died. */
let lastPageReloadAt: number | null = null;

const resourcesDir = app.isPackaged
  ? join(process.resourcesPath, "resources")
  : join(import.meta.dirname, "../../resources");
const appIconPath = join(resourcesDir, APP_ICON_FILE);
const bundledCliPath = app.isPackaged
  ? join(process.resourcesPath, "cli", "loadout.mjs")
  : join(import.meta.dirname, "../../../../packages/cli/dist/loadout.mjs");

const send = createEventSender(() => BrowserWindow.getAllWindows());

// The name macOS shows in the app menu (About, Hide, Quit). Without it Electron uses the package
// name.
app.setName(APP_NAME);
// The app's own files live in the home data folder next to the library, not in the OS app data
// folder. Set before anything reads the path (the single-instance lock does).
const appDataDir = join(
  homedir(),
  LIBRARY_DIR_NAME,
  app.isPackaged ? APP_DATA_DIR_NAME : DEV_APP_DATA_DIR_NAME,
);
app.setPath("userData", appDataDir);
app.setPath("crashDumps", join(appDataDir, CRASH_DUMPS_DIR));

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
    // A deleted library must not come back through the tray either.
    api: () => (core && !libraryGone ? core.api : null),
    show: showWindow,
    navigate: navigateTo,
    quit,
    warn: (message, error) => core?.ctx.log.warn(message, error),
  });
  tray.setVisible(core?.ctx.settings.get("showTrayIcon") ?? true);
}

/** The page asks "quit or keep in tray?"; when it cannot, the app decides without asking. */
const closeRequests = createCloseRequests({
  send: () => send("window:close-requested", {}),
  fallback: () => {
    core?.ctx.log.warn("The page did not take the close question; closing without asking");
    if (core?.ctx.settings.get("showTrayIcon") ?? true) hideToTray();
    else quit();
  },
  timeoutMs: CLOSE_ACK_TIMEOUT_MS,
});

/** The close button asks, hides or quits depending on the saved choice. */
function handleClose(event: Electron.Event): void {
  if (quitting || !core) return;
  const outcome = closeOutcome({
    trayVisible: core.ctx.settings.get("showTrayIcon"),
    closeAction: core.ctx.settings.get("closeAction"),
    rendererAlive: Boolean(mainWindow && !mainWindow.webContents.isCrashed()),
  });
  if (outcome === "close") {
    quitting = true;
    return;
  }
  event.preventDefault();
  if (outcome === "hide") hideToTray();
  else closeRequests.ask();
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
      paths: plan.paths,
      emptyDirs: plan.emptyDirs,
      keychainService: keychainServiceToRemove(process.platform, app.isPackaged, app.getName()),
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
  const win = createMainWindow(appIconPath);
  mainWindow = win;
  win.on("close", handleClose);
  win.on("closed", () => {
    closeRequests.cancel();
    mainWindow = null;
  });
  // A crashed or killed page leaves an empty window: load it again.
  win.webContents.on("render-process-gone", (_event, details) => {
    core?.ctx.log.error(`The window's page stopped: ${details.reason} (${details.exitCode})`);
    if (quitting || win.isDestroyed()) return;
    const now = Date.now();
    if (!shouldReloadPage(details.reason, lastPageReloadAt, now, PAGE_RELOAD_MIN_INTERVAL_MS)) {
      return;
    }
    lastPageReloadAt = now;
    win.webContents.reload();
  });
}

/** Self-update: a published build checks the release feed; a development build does not. */
function createUpdates(log: Core["ctx"]["log"], logsDir: string): UpdateService {
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
    feedUrl: app.isPackaged ? UPDATE_FEED_URL : null,
    feedPublicKey: UPDATE_FEED_PUBLIC_KEY,
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
  // A library on a disk that is not connected is never replaced by an empty one: ask instead.
  const opened = openCoreOrAsk(
    () =>
      createCore({
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
        // Only the app carries out a library move queued in Settings, never a CLI run.
        migrateLibrary: true,
        echoLogs: !app.isPackaged,
        // Started from a terminal, the app has the shell's variables already; they win.
        env: () => ({ ...shellEnv, ...process.env }),
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
      }),
    nativeUnavailablePrompts(),
  );
  if (!opened) {
    app.exit(0);
    return;
  }
  core = opened;

  const api: LoadoutApi = {
    ...core.api,
    app: createAppApi({
      window: () => mainWindow,
      quit,
      removeAllData,
      updates: createUpdates(core.ctx.log, core.ctx.paths.logsDir),
      // The shell's PATH wins here: a Dock launch has a bare one without the editors on it.
      env: () => ({ ...process.env, ...shellEnv }),
      acknowledgeClose: () => closeRequests.acknowledge(),
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
    (namespace) => {
      if (libraryGone && namespace !== "app") {
        return new AppError("UNSUPPORTED", "The library was deleted. Restart or quit.");
      }
      // The core is closing: a call started now could be cut off halfway by the closed database.
      if (quitting && namespace !== "app") return new AppError("BUSY", `${APP_NAME} is closing.`);
      return null;
    },
    isAppPage,
  );

  watchers = [
    watchFolders(
      () => (core ? core.watchPaths() : []),
      () => {
        if (!checkLibrary()) return;
        const reindexed = core?.background.libraryChangedOnDisk() ?? Promise.resolve();
        void reindexed.then(() => {
          send("data:changed", {
            scope: ["skills", "agents", "presets", "projects", "backup"],
          });
          tray?.refresh();
        });
      },
    ),
    watchFolders(
      () => (core ? core.projectWatchPaths() : []),
      () => {
        if (checkLibrary()) send("data:changed", { scope: ["projects"] });
      },
    ),
  ];

  // Opened from the Dock, the app misses what the shell profile exports (CODEX_HOME, …), and
  // the PATH the editors' commands are on.
  void readShellEnv([...AGENT_HOME_ENV_VARIABLES, "PATH"]).then((read) => {
    const found = read ?? {};
    shellEnv = found;
    // Only now are agents' folders final: a skill follows an agent whose folder moved. Never
    // before, nor when the shell could not be read, or a Dock launch would move them to the
    // default folder and back again.
    if (read === null) {
      core?.ctx.log.warn("Could not read the shell's variables");
    } else {
      void core
        ?.followAgentFolders()
        .then((moves) => {
          if (moves.length > 0) send("data:changed", { scope: ["agents", "skills"] });
        })
        .catch((error: unknown) =>
          core?.ctx.log.warn("Could not follow moved agent folders", error),
        );
    }
    const learned = Object.keys(found).filter((name) => process.env[name] === undefined);
    if (learned.length === 0) return;
    core?.ctx.log.info(`Agent folders moved by the shell: ${learned.join(", ")}`);
    send("data:changed", { scope: ["agents", "skills", "projects"] });
    tray?.refresh();
  });

  // Tells a CLI run that the app is open, so it never moves the library out from under it.
  try {
    writeFileSync(join(appDataDir, APP_RUNNING_FILE), String(process.pid));
  } catch (error) {
    core.ctx.log.warn("Could not record that the app is running", error);
  }

  core.background.start();
  syncProxy();
  syncTray();
  openWindow();
}

const crash = createCrashHandlers({
  target: () =>
    core ? { log: core.ctx.log, crashMarkerPath: core.ctx.paths.crashMarkerPath } : null,
  showError: (message) => dialog.showErrorBox(`${APP_NAME} stopped after an error`, message),
  exit: (code) => app.exit(code),
});
process.on("uncaughtException", crash.uncaughtException);
process.on("unhandledRejection", crash.unhandledRejection);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("browser-window-focus", () => void checkLibrary());
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || quitting) quit();
  });
  app.on("before-quit", (event) => {
    quitting = true;
    rmSync(join(appDataDir, APP_RUNNING_FILE), { force: true });
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
  void app.whenReady().then(() => {
    try {
      start();
    } catch (error) {
      // No window and no core: without this the process would linger, invisible, holding the
      // single-instance lock (a database from a newer version, a corrupt or locked database).
      dialog.showErrorBox(`${APP_NAME} could not start`, errorMessage(error));
      app.exit(1);
    }
  });
}
