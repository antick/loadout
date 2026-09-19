import type { AutoBackupEvent, SyncOutcome } from "@skillboard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_FIRST_CHECK_MS,
  AUTO_MAX_BACKOFF_MS,
  AUTO_QUIET_MS,
  type AutoBackup,
  type AutoBackupTarget,
  backoffDelay,
  createAutoBackup,
} from "../src/backup/auto";
import { AppError } from "../src/errors";
import { type Device, createDevice } from "./backup-world";
import { tempDir } from "./helpers";

const OUTCOME: SyncOutcome = { committed: true, merge: null, pushed: true, snapshot: null };

const NOOP = (): void => undefined;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = NOOP;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("automatic backup", () => {
  let temp: ReturnType<typeof tempDir>;
  let device: Device;
  let auto: AutoBackup;
  let sync: ReturnType<typeof vi.fn<() => Promise<SyncOutcome>>>;
  let commitLocal: ReturnType<typeof vi.fn<AutoBackupTarget["commitLocal"]>>;
  let isRepo = true;
  let pending = 0;

  const completed = (): AutoBackupEvent[] =>
    device.events
      .filter((entry) => entry.event === "backup:auto-completed")
      .map((entry) => entry.payload as AutoBackupEvent);

  beforeEach(() => {
    temp = tempDir();
    device = createDevice(temp.dir, "A");
    isRepo = true;
    pending = 0;
    sync = vi.fn(async () => OUTCOME);
    commitLocal = vi.fn(async () => true);
    auto = createAutoBackup(
      { isRepo: () => isRepo, sync, commitLocal, pendingConflicts: () => pending },
      device.ctx,
    );
    vi.useFakeTimers();
  });
  afterEach(() => {
    auto.stop();
    vi.useRealTimers();
    device.close();
    temp.cleanup();
  });

  it("checks once shortly after start", async () => {
    auto.start();
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_CHECK_MS - 1);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(completed()).toEqual([{ ok: true, pending: false, error: null }]);
  });

  it("waits for the library to be quiet, restarting the wait on every change", async () => {
    auto.start();
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_CHECK_MS);
    sync.mockClear();

    auto.notifyChanged();
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS - 1000);
    auto.notifyChanged();
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS - 1000);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).toHaveBeenCalledTimes(1);

    // Nothing else is queued afterwards.
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS * 4);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("does nothing when switched off, without a repository, or before start", async () => {
    auto.notifyChanged();
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS);
    expect(sync).not.toHaveBeenCalled();

    auto.start();
    device.ctx.settings.set("backupAutoEnabled", false);
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_CHECK_MS);
    device.ctx.settings.set("backupAutoEnabled", true);
    isRepo = false;
    auto.notifyChanged();
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS);
    expect(sync).not.toHaveBeenCalled();
    expect(completed()).toEqual([]);
  });

  it("backs off after failures, remembers the error, and recovers", async () => {
    sync.mockRejectedValue(new AppError("NETWORK", "Could not reach the backup remote."));
    auto.start();
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_CHECK_MS);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(device.ctx.settings.get("backupLastAutoError")).toBe(
      "Could not reach the backup remote.",
    );
    expect(completed()).toEqual([
      { ok: false, pending: true, error: "Could not reach the backup remote." },
    ]);

    // Second try after 2 × quiet, third after 4 × quiet.
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS * 2 - 1);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS * 4);
    expect(sync).toHaveBeenCalledTimes(3);

    sync.mockResolvedValue(OUTCOME);
    pending = 2;
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS * 8);
    expect(sync).toHaveBeenCalledTimes(4);
    expect(device.ctx.settings.get("backupLastAutoError")).toBe("");
    expect(completed().at(-1)).toEqual({ ok: true, pending: true, error: null });

    expect(backoffDelay(1)).toBe(AUTO_QUIET_MS * 2);
    expect(backoffDelay(20)).toBe(AUTO_MAX_BACKOFF_MS);
  });

  it("treats a busy library as bad timing, not as a failure", async () => {
    sync.mockRejectedValueOnce(new AppError("BUSY", "The skill library is busy: install"));
    auto.start();
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_CHECK_MS);
    expect(completed()).toEqual([]);
    expect(device.ctx.settings.get("backupLastAutoError")).toBe("");
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("queues one more round for changes that arrive while a backup is running", async () => {
    const running = deferred<SyncOutcome>();
    sync.mockImplementationOnce(() => running.promise);
    auto.start();
    await vi.advanceTimersByTimeAsync(AUTO_FIRST_CHECK_MS);
    auto.notifyChanged();
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS * 2);
    expect(sync).toHaveBeenCalledTimes(1);
    running.resolve(OUTCOME);
    await vi.advanceTimersByTimeAsync(AUTO_QUIET_MS);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("only commits locally on quit, and never waits for a busy library", async () => {
    await auto.runOnQuit();
    expect(commitLocal).toHaveBeenCalledWith(expect.any(String), { failFast: true });
    expect(sync).not.toHaveBeenCalled();

    commitLocal.mockRejectedValueOnce(new Error("disk full"));
    await expect(auto.runOnQuit()).resolves.toBeUndefined();

    device.ctx.settings.set("backupAutoEnabled", false);
    commitLocal.mockClear();
    await auto.runOnQuit();
    expect(commitLocal).not.toHaveBeenCalled();
  });
});
