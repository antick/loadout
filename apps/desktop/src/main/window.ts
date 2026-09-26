import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, type Rectangle, app, screen, shell } from "electron";
import { APP_NAME } from "@loadout/shared";
import {
  TRAFFIC_LIGHT_POSITION,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_STATE_FILE,
} from "./constants";
import { writeFileAtomicSync } from "./files";

const RENDERER_ENTRY = join(import.meta.dirname, "../renderer/index.html");

/** The dev server's page; never in a packaged build, whatever the environment says. */
function devRendererUrl(): string | null {
  return app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null);
}

/** The app's own page: the only one allowed to call the API over IPC. */
export function isAppPage(url: string): boolean {
  const page = url.split(/[?#]/)[0];
  if (page === pathToFileURL(RENDERER_ENTRY).href) return true;
  const dev = devRendererUrl();
  if (!dev) return false;
  try {
    return new URL(url).origin === new URL(dev).origin;
  } catch {
    return false;
  }
}

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

function statePath(): string {
  return join(app.getPath("userData"), WINDOW_STATE_FILE);
}

function loadState(): WindowState | null {
  try {
    if (!existsSync(statePath())) return null;
    const state = JSON.parse(readFileSync(statePath(), "utf8")) as WindowState;
    const visible = screen
      .getAllDisplays()
      .some(
        ({ workArea }) =>
          state.bounds.x < workArea.x + workArea.width &&
          state.bounds.y < workArea.y + workArea.height,
      );
    return visible ? state : null;
  } catch {
    return null;
  }
}

function saveState(win: BrowserWindow): void {
  try {
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    writeFileAtomicSync(statePath(), JSON.stringify(state));
  } catch {
    // Remembering the window size is a nicety.
  }
}

export function createMainWindow(icon: string): BrowserWindow {
  const saved = loadState();
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: saved?.bounds.width ?? WINDOW_DEFAULT_WIDTH,
    height: saved?.bounds.height ?? WINDOW_DEFAULT_HEIGHT,
    x: saved?.bounds.x,
    y: saved?.bounds.y,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: APP_NAME,
    icon,
    show: false,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? TRAFFIC_LIGHT_POSITION : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (saved?.maximized) win.maximize();

  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveState(win));

  // Links never navigate the app window; they open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  const devUrl = devRendererUrl();
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(RENDERER_ENTRY);
  return win;
}

export function focusWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
