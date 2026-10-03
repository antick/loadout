import type { DetectedEditor, EditorChoice } from "./editors";
import type { RemoveAllDataOptions } from "./storage";
import type { AppInfo, AppUpdateStatus } from "./types";

/** A file type offered in an open or save dialog: `{ name: "Preset files", extensions: ["json"] }`. */
export interface FileTypeFilter {
  name: string;
  /** Without the dot. */
  extensions: string[];
}

/** Implemented by the Electron main process, not by core. */
export interface AppApi {
  info(): Promise<AppInfo>;
  pickFolder(title?: string): Promise<string | null>;
  pickArchive(): Promise<string | null>;
  /** Native "Open" for one file of the given type. */
  pickFile(filter: FileTypeFilter, title?: string): Promise<string | null>;
  /**
   * Native "Save as", starting in Downloads with `defaultName`: a `.zip` unless `filter` says
   * otherwise.
   */
  pickSavePath(
    defaultName: string,
    title?: string,
    filter?: FileTypeFilter,
  ): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  /** Code editors found on this computer, in a fixed order. */
  editors(): Promise<DetectedEditor[]>;
  /** Open a file or folder in an editor found here, or in the system's default app. */
  openInEditor(editor: EditorChoice, path: string): Promise<void>;
  copyText(text: string): Promise<void>;
  /** Where the app-update flow stands. Changes arrive as `app-update:status` events too. */
  updateStatus(): Promise<AppUpdateStatus>;
  /** Look for a newer release now. */
  checkUpdate(): Promise<AppUpdateStatus>;
  /** Download and verify the newer release. Resolves once it is ready to install. */
  downloadUpdate(): Promise<AppUpdateStatus>;
  /** Stop a download in progress. */
  cancelUpdate(): Promise<AppUpdateStatus>;
  /**
   * Install the downloaded release. For `replace` and `installer` the app quits and the new
   * version starts; for `package` the system installer opens and the app keeps running.
   */
  installUpdate(): Promise<void>;
  quit(): Promise<void>;
  restart(): Promise<void>;
  /** Empty the app's own cache (Chromium's HTTP, code and GPU caches). */
  clearAppCache(): Promise<void>;
  /**
   * Remove every file Loadout keeps on this computer and quit. Links into the library are taken
   * out of agent folders first; copies too when asked. Project folders and the backup remote
   * are left alone. Deletion finishes after the app has exited.
   */
  removeAllData(options: RemoveAllDataOptions): Promise<void>;
  /** Answer the "close or minimise?" prompt raised by `window:close-requested`. */
  resolveClose(action: "hide" | "quit", remember: boolean): Promise<void>;
}
