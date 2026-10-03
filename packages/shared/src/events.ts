import type { AppUpdateStatus, AutoBackupEvent } from "./types";
import type { BackupProgress } from "./types-backup";
import type { InstallProgress } from "./types-install";
import type { RepairReport } from "./types-system";

/** Main → renderer notifications. Payload type per event name. */
export interface AppEvents {
  /** Skills, deployments, presets, projects or agents changed on disk or through the CLI. */
  "data:changed": { scope: DataScope[] };
  "install:progress": InstallProgress;
  /** `added`: new skills of repositories added by themselves (the auto-add setting). */
  "updates:auto-ran": {
    ranAt: number;
    updated: number;
    available: number;
    failed: number;
    added: number;
  };
  "backup:auto-completed": AutoBackupEvent;
  /** A sync or its review moved to another stage, manual or automatic. */
  "backup:progress": BackupProgress;
  /** The window close button was pressed and the user has not chosen a default yet. */
  "window:close-requested": Record<string, never>;
  /** Tray or menu asked the UI to go somewhere. */
  "app:navigate": { to: string };
  /** The library folder or its database was deleted while the app ran. */
  "library:missing": { path: string };
  /** The app-update flow moved: checked, downloading (with progress), ready, failed. */
  "app-update:status": AppUpdateStatus;
  /** The deployment repair ran: at start-up, or on request. */
  "deploy:repaired": RepairReport;
}

export type DataScope =
  | "skills"
  | "agents"
  | "presets"
  | "projects"
  | "backup"
  | "settings"
  /** Subagents, commands and rules, and where they are deployed. */
  | "items"
  /** Safety reports: kept apart from `skills` so a scan never counts as a library change. */
  | "safety"
  /** Skill usage read from agents' session logs. */
  | "usage";

export type AppEventName = keyof AppEvents;

export const IPC_INVOKE_CHANNEL = "loadout:invoke";
export const IPC_EVENT_CHANNEL = "loadout:event";

/** What the preload script exposes on `window.loadout`. */
export interface PreloadBridge {
  invoke(channel: string, args: unknown[]): Promise<unknown>;
  on(listener: (event: AppEventName, payload: unknown) => void): () => void;
  /** Absolute path of a file or folder the user dropped onto the window (a DOM `File`). */
  pathForFile(file: unknown): string;
}
