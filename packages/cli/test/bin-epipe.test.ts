import { afterEach, describe, expect, it, vi } from "vitest";

// The real CLI is not needed: only what bin.ts does around it.
vi.mock("@loadout/core", () => ({ createCore: vi.fn() }));
vi.mock("../src/run", () => ({ runCli: vi.fn(async () => 0) }));

const pipeError = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`write ${code}`), { code });

describe("bin", () => {
  type Listener = (...args: unknown[]) => void;
  const listeners = (): Listener[] => process.stdout.listeners("error") as Listener[];
  const before = listeners();
  afterEach(() => {
    for (const listener of listeners()) {
      if (!before.includes(listener)) process.stdout.off("error", listener);
    }
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("stops quietly with the current exit code when the reader closes the pipe", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await import("../src/bin");
    process.stdout.emit("error", pipeError("EPIPE"));
    expect(exit).toHaveBeenCalledWith();
    // Anything else on stdout is a real failure and is not swallowed.
    expect(() => process.stdout.emit("error", pipeError("EIO"))).toThrow("write EIO");
  });
});
