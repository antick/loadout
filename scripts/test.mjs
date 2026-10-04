#!/usr/bin/env node
// `pnpm test`: every package's tests through turbo. On a developer's computer the packages run
// one after another, so the tests leave cores free (see vitest.workers.ts). On CI (the `CI`
// variable every CI service sets) the runner does nothing else, so they run side by side.
import { spawnSync } from "node:child_process";

const args = ["run", "test", ...(process.env.CI ? [] : ["--concurrency=1"])];
const result = spawnSync("turbo", [...args, ...process.argv.slice(2)], {
  stdio: "inherit",
  // `turbo` is a .cmd shim on Windows, which only a shell can start.
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
