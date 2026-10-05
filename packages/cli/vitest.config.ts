import { defineConfig } from "vitest/config";
import { TEST_MAX_WORKERS, TEST_TIMEOUT_MS } from "../../vitest.workers.mts";

// Same as core: each CLI test opens a real library on disk, which Windows runners do slowly.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The same git isolation as core's tests: the CLI runs core's git code.
    setupFiles: ["../core/test/git-setup.ts"],
    environment: "node",
    // Set-up installs and exports through the CLI too, as slowly as a test.
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    maxWorkers: TEST_MAX_WORKERS,
  },
});
