import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import { TEST_MAX_WORKERS, TEST_TIMEOUT_MS } from "../../vitest.workers.mts";

// Same `@` alias as the renderer build, so tested modules import the way the app does.
// `e2e/` holds the Playwright UI tests, which run on their own (`pnpm test:ui`).
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src/renderer/src") } },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    maxWorkers: TEST_MAX_WORKERS,
    // Some tests start a shell or PowerShell, which a Windows runner starts slowly.
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
  },
});
