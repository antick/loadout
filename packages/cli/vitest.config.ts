import { defineConfig } from "vitest/config";

// Same as core: each CLI test opens a real library on disk, which Windows runners do slowly.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
