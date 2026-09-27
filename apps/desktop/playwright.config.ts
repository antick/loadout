import { defineConfig, devices } from "@playwright/test";

// UI tests click through the renderer in headless Chromium, on the in-memory preview bridge
// (`src/renderer/src/lib/dev-mock.ts`). Electron never starts. Run: `pnpm test:ui`.
const PORT = 5197;
const BASE_URL = `http://localhost:${PORT}/`;
const CI = Boolean(process.env.CI);
const SERVER_START_TIMEOUT_MS = 120_000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: "vite --config e2e/vite.config.ts",
    url: BASE_URL,
    env: { LOADOUT_RENDERER_PORT: String(PORT) },
    reuseExistingServer: !CI,
    timeout: SERVER_START_TIMEOUT_MS,
  },
});
