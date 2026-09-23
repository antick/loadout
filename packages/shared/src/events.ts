import type { AutoBackupEvent } from "./types";
import type { InstallProgress } from "./types-install";

/** Main → renderer notifications. Payload type per event name. */
export interface AppEvents {
  /** Skills, deployments, presets, projects or agents changed on disk or through the CLI. */
  "data:changed": { scope: DataScope[] };
  "install:progress": InstallProgress;
  "updates:auto-ran": { ranAt: number; updated: number; available: number; failed: number };
  "backup:auto-completed": AutoBackupEvent;
  /** The window close button was pressed and the user has not chosen a default yet. */
  "window:close-requested": Record<string, never>;
  /** Tray or menu asked the UI to go somewhere. */
  "app:navigate": { to: string };
  /** The library folder or its database was deleted while the app ran. */
  "library:missing": { path: string };
}

export type DataScope = "skills" | "agents" | "presets" | "projects" | "backup" | "settings";

export type AppEventName = keyof AppEvents;

export const APP_EVENT_NAMES = [
  "data:changed",
  "install:progress",
  "updates:auto-ran",
  "backup:auto-completed",
  "window:close-requested",
  "app:navigate",
  "library:missing",
] as const satisfies readonly AppEventName[];

export const IPC_INVOKE_CHANNEL = "loadout:invoke";
export const IPC_EVENT_CHANNEL = "loadout:event";

/** What the preload script exposes on `window.loadout`. */
export interface PreloadBridge {
  invoke(channel: string, args: unknown[]): Promise<unknown>;
  on(listener: (event: AppEventName, payload: unknown) => void): () => void;
  /** Absolute path of a file or folder the user dropped onto the window (a DOM `File`). */
  pathForFile(file: unknown): string;
}
