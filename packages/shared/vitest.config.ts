import { defineConfig } from "vitest/config";
import { TEST_MAX_WORKERS } from "../../vitest.workers.mts";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    maxWorkers: TEST_MAX_WORKERS,
    // Dates read the same in every time zone; the formatters still use the reader's language.
    env: { TZ: "UTC" },
  },
});
