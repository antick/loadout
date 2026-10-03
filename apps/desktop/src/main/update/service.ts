import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  APP_ID,
  type AppUpdateStatus,
  RELEASES_URL,
  UPDATE_FEED_SIGNATURE_SUFFIX,
  type UpdateFeed,
  type UpdateFeedFile,
  isNewerVersion,
  parseUpdateFeed,
  errorMessage,
} from "@loadout/shared";
import {
  UPDATE_EXIT_WAIT_SECONDS,
  UPDATE_LOG_FILE,
  UPDATE_PENDING_FILE,
  UPDATE_PROGRESS_INTERVAL_MS,
  UPDATE_READY_FILE,
  UPDATE_TIMEOUT_MS,
} from "../constants";
import { downloadVerified, sha256Of } from "./download";
import { isFeedSignedBy, updateTargetFor } from "./feed";
import { prepareAppImage, prepareMacBundle, startSwap, startWindowsInstaller } from "./install";
import type { AppLocation } from "./locate";

export interface UpdateServiceDeps {
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  location: AppLocation;
  /** Null when this build has no feed (a development build without a test feed). */
  feedUrl: string | null;
  /**
   * The release key's public half: the feed must come with a signature from it. Null only for a
   * development build reading a test feed.
   */
  feedPublicKey: string | null;
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
  /** The file as downloaded; checked again against the signed feed right before installing. */
  archive?: string;
}

/** The signed feed the download was checked against, kept next to it for the second check. */
const FEED_COPY_FILE = "feed.json";
const REVERIFY_FAILED = "The downloaded update changed since it was checked. Download it again.";

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
  /** Reasons updating cannot work at all here, whatever the feed says. */
  const baseBlocker = (): AppUpdateStatus["blocker"] =>
    deps.feedUrl ? deps.location.blocker : "not_configured";

  /** The raw signed feed of the last check, kept with a download for its second check. */
  let feedCopy: { bytes: Uint8Array; signature: string } | null = null;

  let state: AppUpdateStatus = {
    phase: "idle",
    currentVersion: deps.currentVersion,
    latestVersion: null,
    releaseUrl: RELEASES_URL,
    method: deps.location.method,
    blocker: baseBlocker(),
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

  /** Refuse a feed whose signature is missing or not from the release key. */
  async function requireSignature(
    feedUrl: string,
    feedBytes: Uint8Array,
    publicKey: string,
  ): Promise<string> {
    const response = await deps.fetchImpl(`${feedUrl}${UPDATE_FEED_SIGNATURE_SUFFIX}`, {
      signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
      cache: "no-store",
    });
    const signature = response.ok ? await response.text() : "";
    if (!isFeedSignedBy(feedBytes, signature, publicKey)) {
      throw new Error("The update feed is not signed by Loadout's release key, so it was ignored.");
    }
    return signature;
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
      const bytes = new Uint8Array(await response.arrayBuffer());
      const signature = deps.feedPublicKey
        ? await requireSignature(deps.feedUrl, bytes, deps.feedPublicKey)
        : "";
      feed = parseUpdateFeed(JSON.parse(new TextDecoder().decode(bytes)), deps.feedUrl);
      feedCopy = { bytes, signature };
    } catch (error) {
      return set({ phase: before === "ready" ? "ready" : "error", error: errorMessage(error) });
    }
    const releaseUrl = feed.releaseUrl ?? RELEASES_URL;
    const checkedAt = Date.now();
    if (!isNewerVersion(feed.version, deps.currentVersion)) {
      return set({ phase: "up_to_date", latestVersion: feed.version, releaseUrl, checkedAt });
    }
    if (ready?.version === feed.version) {
      return set({ phase: "ready", latestVersion: feed.version, releaseUrl, checkedAt });
    }
    // From the fixed reasons, not the last state: a feed that lacked this build must not block
    // a later one that has it.
    const blocker = baseBlocker() ?? (feedFile() ? null : "no_build");
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

  /** A second click while the first is still checking joins it instead of downloading twice. */
  let downloading: Promise<AppUpdateStatus> | null = null;

  function download(): Promise<AppUpdateStatus> {
    downloading ??= runDownload().finally(() => {
      downloading = null;
    });
    return downloading;
  }

  async function runDownload(): Promise<AppUpdateStatus> {
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
      if (feedCopy) {
        await writeFile(join(dir, FEED_COPY_FILE), feedCopy.bytes);
        await writeFile(
          join(dir, `${FEED_COPY_FILE}${UPDATE_FEED_SIGNATURE_SUFFIX}`),
          feedCopy.signature,
        );
      }
      ready = { version, path, releaseUrl: state.releaseUrl, archive: downloaded };
      await writeFile(readyFile, JSON.stringify(ready));
      deps.log.info(`Update ${version} downloaded and checked`);
      return set({ phase: "ready", progress: null });
    } catch (error) {
      // What arrived stays in the folder, so the next download continues it.
      if (controller.signal.aborted) return set({ phase: "available", progress: null });
      deps.log.warn(`Update ${version} download failed`, error);
      return set({ phase: "error", progress: null, error: errorMessage(error) });
    } finally {
      if (abort === controller) abort = null;
    }
  }

  function cancel(): AppUpdateStatus {
    abort?.abort();
    return state;
  }

  /**
   * Check the download again, right before it runs: against the signed feed kept next to it, and
   * rebuilt from that checked file. A download that sat on disk for days is never trusted as is.
   */
  async function reverify(saved: ReadyUpdate): Promise<string> {
    if (!saved.archive || !target) throw new Error(REVERIFY_FAILED);
    const dir = dirname(saved.archive);
    const bytes = new Uint8Array(await readFile(join(dir, FEED_COPY_FILE)));
    if (deps.feedPublicKey) {
      const signaturePath = join(dir, `${FEED_COPY_FILE}${UPDATE_FEED_SIGNATURE_SUFFIX}`);
      const signature = await readFile(signaturePath, "utf8");
      if (!isFeedSignedBy(bytes, signature, deps.feedPublicKey)) throw new Error(REVERIFY_FAILED);
    }
    const copy = parseUpdateFeed(JSON.parse(new TextDecoder().decode(bytes)), deps.feedUrl ?? "");
    const file = copy.files[target];
    const matches =
      copy.version === saved.version && file && (await sha256Of(saved.archive)) === file.sha256;
    if (!matches) throw new Error(REVERIFY_FAILED);
    return prepare(saved.archive, dir, saved.version);
  }

  /** Forget a download that failed its second check, so the next click downloads it afresh. */
  async function discardReady(saved: ReadyUpdate, error: unknown): Promise<never> {
    ready = null;
    if (saved.archive) await rm(dirname(saved.archive), { recursive: true, force: true });
    await rm(readyFile, { force: true });
    set({ phase: "available", error: errorMessage(error) });
    throw error;
  }

  async function install(): Promise<void> {
    if (!ready || state.phase !== "ready") throw new Error("No update is ready to install");
    const saved = ready;
    const path = await reverify(saved).catch((error: unknown) => discardReady(saved, error));
    ready = { ...saved, path };
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
