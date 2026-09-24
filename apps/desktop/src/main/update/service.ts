import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_ID, type AppUpdateStatus, RELEASES_URL, isNewerVersion } from "@loadout/shared";
import {
  UPDATE_EXIT_WAIT_SECONDS,
  UPDATE_LOG_FILE,
  UPDATE_PENDING_FILE,
  UPDATE_PROGRESS_INTERVAL_MS,
  UPDATE_READY_FILE,
  UPDATE_TIMEOUT_MS,
} from "../constants";
import { downloadVerified } from "./download";
import { type UpdateFeed, type UpdateFeedFile, parseUpdateFeed, updateTargetFor } from "./feed";
import { prepareAppImage, prepareMacBundle, startSwap, startWindowsInstaller } from "./install";
import type { AppLocation } from "./locate";

export interface UpdateServiceDeps {
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  location: AppLocation;
  /** Null when this build has no feed (a development build without a test feed). */
  feedUrl: string | null;
  /** Downloads and working copies; the service owns everything inside. */
  updatesDir: string;
  logsDir: string;
  fetchImpl: typeof fetch;
  emit(status: AppUpdateStatus): void;
  /** Quit the app the normal way (the backup on quit still runs). */
  quit(): void;
  /** Open a file with the system's default app. Resolves to an error message, or "". */
  openPath(path: string): Promise<string>;
  log: { info(message: string): void; warn(message: string, error?: unknown): void };
}

/** A download that passed its checks and can be installed. Survives restarts. */
interface ReadyUpdate {
  version: string;
  /** What gets installed: the unpacked app, the AppImage, the installer or the package. */
  path: string;
  releaseUrl: string;
}

interface PendingInstall {
  from: string;
  to: string;
  at: number;
}

export interface UpdateService {
  status(): AppUpdateStatus;
  /** Report the previous install, clear old downloads, and pick up a finished one. */
  start(): Promise<void>;
  check(): Promise<AppUpdateStatus>;
  download(): Promise<AppUpdateStatus>;
  cancel(): AppUpdateStatus;
  install(): Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  const target = updateTargetFor(
    deps.platform,
    deps.arch,
    deps.location.method === "replace" && deps.platform === "linux",
  );
  const readyFile = join(deps.updatesDir, UPDATE_READY_FILE);
  const pendingFile = join(deps.updatesDir, UPDATE_PENDING_FILE);
  let feed: UpdateFeed | null = null;
  let ready: ReadyUpdate | null = null;
  let abort: AbortController | null = null;
  let lastProgressAt = 0;
  let state: AppUpdateStatus = {
    phase: "idle",
    currentVersion: deps.currentVersion,
    latestVersion: null,
    releaseUrl: RELEASES_URL,
    method: deps.location.method,
    blocker: deps.feedUrl ? deps.location.blocker : "not_configured",
    progress: null,
    checkedAt: null,
    error: null,
    lastInstall: null,
  };

  function set(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
    state = { ...state, ...patch };
    deps.emit(state);
    return state;
  }

  /** The feed's build for this system, or null (and the status says so). */
  function feedFile(): UpdateFeedFile | null {
    return (target && feed?.files[target]) || null;
  }

  async function start(): Promise<void> {
    const pending = await readJson<PendingInstall>(pendingFile);
    if (pending) {
      const ok = pending.to === deps.currentVersion;
      state.lastInstall = { version: pending.to, ok, at: pending.at };
      if (ok) deps.log.info(`Updated from ${pending.from} to ${pending.to}`);
      else deps.log.warn(`The update to ${pending.to} did not arrive; see ${UPDATE_LOG_FILE}`);
    }
    const saved = await readJson<ReadyUpdate>(readyFile);
    const keep =
      saved && isNewerVersion(saved.version, deps.currentVersion) && existsSync(saved.path);
    if (keep) {
      ready = saved;
      state = {
        ...state,
        phase: "ready",
        latestVersion: saved.version,
        releaseUrl: saved.releaseUrl,
      };
    }
    // Everything else in the folder belongs to older or abandoned downloads.
    await mkdir(deps.updatesDir, { recursive: true });
    for (const name of await readdir(deps.updatesDir)) {
      if (keep && (name === saved.version || name === UPDATE_READY_FILE)) continue;
      await rm(join(deps.updatesDir, name), { recursive: true, force: true });
    }
    deps.emit(state);
  }

  async function check(): Promise<AppUpdateStatus> {
    if (!deps.feedUrl || state.phase === "downloading" || state.phase === "installing") {
      return state;
    }
    const before = state.phase;
    set({ phase: "checking", error: null });
    try {
      const response = await deps.fetchImpl(deps.feedUrl, {
        signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
        cache: "no-store",
      });
      // No release published yet: the "latest" link has nothing to point at.
      if (response.status === 404) {
        return set({ phase: "up_to_date", checkedAt: Date.now(), latestVersion: null });
      }
      if (!response.ok) throw new Error(`The update check failed (${response.status})`);
      feed = parseUpdateFeed(await response.json(), deps.feedUrl);
    } catch (error) {
      return set({ phase: before === "ready" ? "ready" : "error", error: message(error) });
    }
    const releaseUrl = feed.releaseUrl ?? RELEASES_URL;
    const checkedAt = Date.now();
    if (!isNewerVersion(feed.version, deps.currentVersion)) {
      return set({ phase: "up_to_date", latestVersion: feed.version, releaseUrl, checkedAt });
    }
    if (ready?.version === feed.version) {
      return set({ phase: "ready", latestVersion: feed.version, releaseUrl, checkedAt });
    }
    const blocker = state.blocker ?? (feedFile() ? null : "no_build");
    return set({ phase: "available", latestVersion: feed.version, releaseUrl, checkedAt, blocker });
  }

  /** Turn the verified download into what `install` needs. */
  async function prepare(downloaded: string, dir: string, version: string): Promise<string> {
    if (deps.platform === "darwin") {
      return prepareMacBundle(downloaded, join(dir, "stage"), { bundleId: APP_ID, version });
    }
    if (deps.platform === "linux" && deps.location.method === "replace") {
      return prepareAppImage(downloaded);
    }
    return downloaded;
  }

  async function download(): Promise<AppUpdateStatus> {
    if (state.phase === "downloading" || state.phase === "ready") return state;
    if (!feed || state.phase !== "available") await check();
    const file = feedFile();
    if (!feed || !file || state.phase !== "available" || state.blocker) return state;

    const version = feed.version;
    const dir = join(deps.updatesDir, version);
    const controller = new AbortController();
    abort = controller;
    set({ phase: "downloading", progress: { received: 0, total: file.size }, error: null });
    try {
      await mkdir(dir, { recursive: true });
      const downloaded = join(dir, file.name);
      await downloadVerified(file, downloaded, {
        fetchImpl: deps.fetchImpl,
        signal: controller.signal,
        onProgress: (received) => {
          const now = Date.now();
          if (now - lastProgressAt < UPDATE_PROGRESS_INTERVAL_MS) return;
          lastProgressAt = now;
          set({ progress: { received, total: file.size } });
        },
      });
      const path = await prepare(downloaded, dir, version);
      ready = { version, path, releaseUrl: state.releaseUrl };
      await writeFile(readyFile, JSON.stringify(ready));
      deps.log.info(`Update ${version} downloaded and checked`);
      return set({ phase: "ready", progress: null });
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      if (controller.signal.aborted) return set({ phase: "available", progress: null });
      deps.log.warn(`Update ${version} download failed`, error);
      return set({ phase: "error", progress: null, error: message(error) });
    } finally {
      if (abort === controller) abort = null;
    }
  }

  function cancel(): AppUpdateStatus {
    abort?.abort();
    return state;
  }

  async function install(): Promise<void> {
    if (!ready || state.phase !== "ready") throw new Error("No update is ready to install");
    if (deps.location.method === "package") {
      const failure = await deps.openPath(ready.path);
      if (failure) throw new Error(failure);
      return;
    }
    const pending: PendingInstall = {
      from: deps.currentVersion,
      to: ready.version,
      at: Date.now(),
    };
    await writeFile(pendingFile, JSON.stringify(pending));
    await mkdir(deps.logsDir, { recursive: true });
    const logFile = join(deps.logsDir, UPDATE_LOG_FILE);
    if (deps.location.method === "installer") {
      startWindowsInstaller({
        pid: process.pid,
        installer: ready.path,
        waitSeconds: UPDATE_EXIT_WAIT_SECONDS,
      });
    } else {
      const replaced = deps.location.target;
      if (!replaced) throw new Error("Cannot tell where the app is installed");
      startSwap({
        pid: process.pid,
        target: replaced,
        staged: ready.path,
        logFile,
        waitSeconds: UPDATE_EXIT_WAIT_SECONDS,
        kind: deps.platform === "darwin" ? "bundle" : "file",
      });
    }
    deps.log.info(`Installing update ${ready.version}; the app quits now`);
    set({ phase: "installing" });
    deps.quit();
  }

  return { status: () => state, start, check, download, cancel, install };
}
