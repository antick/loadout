import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exec } from "../src/util/exec";

/** Run `fn` with the process reporting `platform`, then put the real one back. */
async function onPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const real = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return await fn();
  } finally {
    if (real) Object.defineProperty(process, "platform", real);
  }
}

describe("running a program on Windows", () => {
  let root: string | null = null;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("finds it on PATH only, never in the working folder", async () => {
    root = mkdtempSync(join(tmpdir(), "exec-"));
    const bin = join(root, "bin");
    mkdirSync(bin);
    // A real program under the name looked up: this Node, which can say where it ran from.
    copyFileSync(process.execPath, join(bin, "git.exe"));
    writeFileSync(join(bin, "tool.cmd"), "");
    const env = { PATH: ["relative-dir", bin].join(delimiter) };
    const say = ["-e", "process.stdout.write(process.argv0)"];
    await onPlatform("win32", async () => {
      const found = await exec("git", say, { env, cwd: root ?? undefined });
      expect(found.stdout).toBe(join(bin, "git.exe"));
      // A batch file cannot be started without a shell: not picked.
      await expect(exec("tool", [], { env })).rejects.toMatchObject({ code: "UNSUPPORTED" });
      await expect(exec("missing", [], { env })).rejects.toMatchObject({ code: "UNSUPPORTED" });
      const absolute = await exec(join(bin, "git.exe"), say, { env });
      expect(absolute.stdout).toBe(join(bin, "git.exe"));
    });
  });
});

describe("piping input to a program", () => {
  // Far more than a pipe holds, so the program is gone while input is still being written.
  const input = "x".repeat(16 * 1024 * 1024);

  it("answers with the exit code when the program quits before reading its input", async () => {
    const result = await exec(process.execPath, ["-e", "process.exit(3)"], { input });
    expect(result.code).toBe(3);
  });

  it("says the program is missing, never crashes, when it cannot start", async () => {
    await expect(exec("no-such-program-here", [], { input })).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });
});
