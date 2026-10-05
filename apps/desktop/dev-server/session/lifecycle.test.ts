import { describe, expect, it, vi } from "vitest";
import { RESTORE_FAILED, SEED_FAILED, createLifecycle } from "./lifecycle";

function steps(restore: () => Promise<void>) {
  return {
    seed: vi.fn(async () => {}),
    restore: vi.fn(restore),
    report: vi.fn(),
  };
}

describe("createLifecycle", () => {
  it("seeds once and restores on reset", async () => {
    const used = steps(async () => {});
    const lifecycle = createLifecycle(used);
    await lifecycle.ready();
    await lifecycle.reset();
    await lifecycle.ready();
    expect(used.seed).toHaveBeenCalledTimes(1);
    expect(used.restore).toHaveBeenCalledTimes(1);
    expect(used.report).not.toHaveBeenCalled();
  });

  it("seeds afresh when a restore fails, and the session stays usable", async () => {
    const failure = new Error("rename failed");
    const used = steps(async () => {
      throw failure;
    });
    const lifecycle = createLifecycle(used);
    await lifecycle.ready();
    await expect(lifecycle.reset()).resolves.toBeUndefined();
    await expect(lifecycle.ready()).resolves.toBeUndefined();
    expect(used.seed).toHaveBeenCalledTimes(2);
    expect(used.report).toHaveBeenCalledWith(RESTORE_FAILED, failure);
    await lifecycle.reset();
    expect(used.seed).toHaveBeenCalledTimes(3);
  });

  it("reports a seed that fails and every call sees the error", async () => {
    const failure = new Error("no disk");
    const used = steps(async () => {});
    used.seed.mockRejectedValue(failure);
    const lifecycle = createLifecycle(used);
    await expect(lifecycle.ready()).rejects.toBe(failure);
    expect(used.report).toHaveBeenCalledWith(SEED_FAILED, failure);
  });
});
