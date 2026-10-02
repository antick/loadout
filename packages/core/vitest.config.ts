import { defineConfig } from "vitest/config";

/** Backup tests run real git on several devices; their set-up (`beforeEach`) does as much as a test. */
const TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
  },
});
