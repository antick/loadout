import { defineConfig } from "vitest/config";
import { TEST_MAX_WORKERS } from "../../vitest.workers";

/** Backup tests run real git on several devices; their set-up (`beforeEach`) does as much as a test. */
const TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Keeps the developer's own git config out of every test and gives commits a name.
    setupFiles: ["test/git-setup.ts"],
    environment: "node",
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
    maxWorkers: TEST_MAX_WORKERS,
  },
});
