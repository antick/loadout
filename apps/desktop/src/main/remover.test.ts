import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REMOVER_SCRIPT, type RemovalJob, startRemoval } from "./remover";

/** Run the clean-up script to the end, as the detached process would, for a job already due. */
function runRemoval(job: RemovalJob): void {
  execFileSync(process.execPath, ["-e", REMOVER_SCRIPT, JSON.stringify(job), "0"]);
}

let root: string;

function seed(): { home: string; moved: string; job: RemovalJob } {
  const home = join(root, ".loadout");
  const moved = join(root, "Dropbox", "library");
  mkdirSync(join(home, "app"), { recursive: true });
  writeFileSync(join(home, "library.json"), "{}");
  mkdirSync(join(moved, "skills", "alpha"), { recursive: true });
  writeFileSync(join(moved, "loadout.db"), "db");
  return {
    home,
    moved,
    job: {
      pid: process.pid,
      paths: [join(moved, "skills"), join(moved, "loadout.db"), home],
      emptyDirs: [moved],
      keychainService: null,
    },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "loadout-remover-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the clean-up script", () => {
  it("deletes the listed paths and a folder left empty", () => {
    const { home, moved, job } = seed();
    runRemoval({ ...job, pid: 0 });
    expect(existsSync(home)).toBe(false);
    expect(existsSync(moved)).toBe(false);
    expect(existsSync(join(root, "Dropbox"))).toBe(true);
  });

  it("keeps a folder that still holds something else", () => {
    const { moved, job } = seed();
    writeFileSync(join(moved, "notes.txt"), "mine");
    runRemoval({ ...job, pid: 0 });
    expect(existsSync(join(moved, "notes.txt"))).toBe(true);
    expect(existsSync(join(moved, "skills"))).toBe(false);
  });

  it("waits for the app to exit before deleting", async () => {
    const { home, job } = seed();
    const app = spawn(process.execPath, ["-e", "setTimeout(() => {}, 400)"]);
    const started = Date.now();
    await new Promise<void>((resolve) => {
      startRemoval({ ...job, pid: app.pid ?? 0 }, process.execPath);
      app.on("exit", () => resolve());
    });
    // The clean-up runs detached; give it a moment after the app is gone.
    for (let tries = 0; tries < 50 && existsSync(home); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    expect(existsSync(home)).toBe(false);
  });
});
