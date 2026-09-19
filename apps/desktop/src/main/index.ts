import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { APP_NAME } from "@skillboard/core";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: APP_NAME,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

void app.whenReady().then(createWindow);
