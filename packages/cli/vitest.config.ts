import { defineConfig } from "vitest/config";
import { TEST_MAX_WORKERS } from "../../vitest.workers";

// Same as core: each CLI test opens a real library on disk, which Windows runners do slowly.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The same git isolation as core's tests: the CLI runs core's git code.
    setupFiles: ["../core/test/git-setup.ts"],
    environment: "node",
    testTimeout: 30_000,
    maxWorkers: TEST_MAX_WORKERS,
  },
});
