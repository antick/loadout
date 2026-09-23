/** Values owned by the Electron main process. */

export const WINDOW_DEFAULT_WIDTH = 1320;
export const WINDOW_DEFAULT_HEIGHT = 860;
export const WINDOW_MIN_WIDTH = 960;
export const WINDOW_MIN_HEIGHT = 620;
/** Where macOS draws the window buttons inside our own title bar. */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 17 };

export const WINDOW_STATE_FILE = "window-state.json";
export const SECRETS_FILE = "secrets.json";
export const APP_ICON_FILE = "icon.png";
/** Chromium's web storage folder: interface preferences and unsaved editor drafts. */
export const WEB_STORAGE_DIR = "Local Storage";
/** Chromium's crash reports, kept inside the app data folder. */
export const CRASH_DUMPS_DIR = "Crashpad";
/** Chromium's single-instance marker: a link named `<host>-<pid>` while that instance runs. */
export const SINGLETON_LOCK_FILE = "SingletonLock";

/** File-watcher timings. */
export const WATCH_DEBOUNCE_MS = 500;
/** Merges bursts of change events into one tray menu rebuild. */
export const TRAY_REFRESH_DEBOUNCE_MS = 300;
/** Ignore filesystem events for this long after the app itself wrote something. */
export const WATCH_SELF_WRITE_MUTE_MS = 1200;
/** Agent folders can appear after launch; re-resolve what to watch this often. */
export const WATCH_RESCAN_MS = 60_000;

/** First update check after launch, and the HTTP timeout for it. */
export const UPDATE_CHECK_DELAY_MS = 3000;
export const UPDATE_CHECK_TIMEOUT_MS = 15_000;
/**
 * JSON endpoint describing the newest release: `{ "version": "1.2.3", "url": "https://…" }`.
 * Empty until a release feed exists; the UI then says updates are not configured.
 */
export const UPDATE_FEED_URL = process.env.LOADOUT_UPDATE_FEED ?? "";

export const ARCHIVE_EXTENSIONS = ["zip", "skill"];
