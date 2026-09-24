import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SWAP_SCRIPT } from "./install";

let root: string;

/** A process id that has already exited. */
function exitedPid(): number {
  return spawnSync(process.execPath, ["-e", "0"]).pid ?? 999_999;
}

function swap(pid: number, target: string, staged: string, waitSeconds: number): number {
  const result = spawnSync("/bin/sh", [
    "-c",
    SWAP_SCRIPT,
    "sh",
    String(pid),
    target,
    staged,
    join(root, "update.log"),
    String(waitSeconds),
    "file",
  ]);
  return result.status ?? -1;
}

async function waitFor(path: string): Promise<boolean> {
  for (let i = 0; i < 50; i += 1) {
    if (existsSync(path)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "loadout-swap-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(process.platform === "win32")("swap script", () => {
  it("replaces the app after it exited and starts the new one", async () => {
    const target = join(root, "Loadout.AppImage");
    const staged = join(root, "staged.AppImage");
    const started = join(root, "started");
    writeFileSync(target, "#!/bin/sh\necho old\n");
    writeFileSync(staged, `#!/bin/sh\ntouch "${started}"\n`);

    expect(swap(exitedPid(), target, staged, 5)).toBe(0);
    expect(readFileSync(target, "utf8")).toContain(started);
    expect(existsSync(staged)).toBe(false);
    expect(await waitFor(started)).toBe(true);
    expect(readFileSync(join(root, "update.log"), "utf8")).toContain("replaced");
  });

  it("leaves everything alone when the app does not exit", () => {
    const target = join(root, "Loadout.AppImage");
    const staged = join(root, "staged.AppImage");
    writeFileSync(target, "old");
    writeFileSync(staged, "new");

    expect(swap(process.pid, target, staged, 0)).toBe(1);
    expect(readFileSync(target, "utf8")).toBe("old");
    expect(readFileSync(staged, "utf8")).toBe("new");
    expect(execFileSync("cat", [join(root, "update.log")]).toString()).toContain("did not exit");
  });
});
