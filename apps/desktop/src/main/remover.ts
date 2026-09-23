import { spawn } from "node:child_process";

/** What the clean-up process deletes once the app has exited. */
export interface RemovalJob {
  /** The app's process; deletion waits for it to be gone. */
  pid: number;
  /** Deleted outright. */
  paths: string[];
  /** Removed afterwards only when empty. */
  emptyDirs: string[];
  /** macOS keychain item holding the key the app encrypted credentials with, or null. */
  keychainService: string | null;
}

/** How long the clean-up waits for the app to exit before deleting anyway. */
export const EXIT_WAIT_MS = 30_000;
const EXIT_POLL_MS = 200;

/**
 * The clean-up, run by a separate Node process (the app's own runtime) with the job as its only
 * argument. Kept as source text: a bundled function would not survive being turned back into a
 * script. Deleting after the app exited means nothing it writes on its way out (window state,
 * Chromium's files) brings a folder back.
 */
export const REMOVER_SCRIPT = `
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const job = JSON.parse(process.argv[1]);
const waitMs = Number(process.argv[2]);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const deadline = Date.now() + waitMs;
const pause = new Int32Array(new SharedArrayBuffer(4));
while (alive(job.pid) && Date.now() < deadline) Atomics.wait(pause, 0, 0, ${EXIT_POLL_MS});
for (const path of job.paths) {
  try {
    fs.rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch {}
}
for (const dir of job.emptyDirs) {
  try {
    fs.rmdirSync(dir);
  } catch {}
}
if (job.keychainService) {
  try {
    execFileSync("security", ["delete-generic-password", "-s", job.keychainService], {
      stdio: "ignore",
    });
  } catch {}
}
`;

/** Start the clean-up in a detached process that outlives the app. */
export function startRemoval(job: RemovalJob, runtime: string, waitMs = EXIT_WAIT_MS): void {
  const child = spawn(runtime, ["-e", REMOVER_SCRIPT, JSON.stringify(job), String(waitMs)], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  child.unref();
}
