import { defineConfig } from "vitest/config";
import { TEST_MAX_WORKERS, TEST_TIMEOUT_MS } from "../../vitest.workers";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Keeps the developer's own git config out of every test and gives commits a name.
    setupFiles: ["test/git-setup.ts"],
    environment: "node",
    // Backup tests run real git on several devices; their set-up does as much as a test.
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    maxWorkers: TEST_MAX_WORKERS,
  },
});
