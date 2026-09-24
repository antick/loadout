/** Values owned by the Electron main process. */

export const WINDOW_DEFAULT_WIDTH = 1320;
export const WINDOW_DEFAULT_HEIGHT = 860;
export const WINDOW_MIN_WIDTH = 960;
export const WINDOW_MIN_HEIGHT = 620;
/**
 * Where macOS draws the window buttons inside our own title bar. The buttons are 14px tall, so
 * y = (42 - 14) / 2 centres them in the 42px bar (TOP_BAR_HEIGHT_CLASS in the renderer).
 */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 14 };

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

/** App updates: first check after launch, then how often while the app runs. */
export const UPDATE_CHECK_DELAY_MS = 3000;
export const UPDATE_RECHECK_MS = 6 * 60 * 60 * 1000;
/** Timeout for fetching the update feed. */
export const UPDATE_TIMEOUT_MS = 15_000;
/** Progress events while downloading an update, at most this often. */
export const UPDATE_PROGRESS_INTERVAL_MS = 250;
/** No data for this long: the download reconnects and continues where it stopped. */
export const UPDATE_STALL_MS = 30_000;
/** Connections tried for one download before it gives up (the next try continues it). */
export const UPDATE_DOWNLOAD_ATTEMPTS = 5;
/** How long the replacement waits for the app to exit (the backup on quit runs first). */
export const UPDATE_EXIT_WAIT_SECONDS = 180;
/**
 * A test feed instead of the published one, e.g. `http://127.0.0.1:8080/latest.json`. Also the
 * only way a development build checks for updates.
 */
export const UPDATE_FEED_OVERRIDE_ENV = "LOADOUT_UPDATE_FEED";
/** Inside the app data folder: downloaded updates. */
export const UPDATES_DIR = "updates";
/** Inside the updates folder: the checked download waiting to be installed. */
export const UPDATE_READY_FILE = "ready.json";
/** Inside the updates folder: written just before an install, read by the next start. */
export const UPDATE_PENDING_FILE = "pending-install.json";
/** Inside the logs folder: what the replacement did after the app quit. */
export const UPDATE_LOG_FILE = "update.log";

export const ARCHIVE_EXTENSIONS = ["zip", "skill"];
/** What "Export as .zip" saves. */
export const EXPORT_EXTENSION = "zip";
