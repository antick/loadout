import { defineConfig, devices } from "@playwright/test";

// UI tests click through the renderer in headless Chromium, on the real core: the dev server
// (`dev-server/plugin.ts`) runs it on a seeded temporary home per worker. Electron never starts.
// Run: `pnpm test:ui`.
const DEFAULT_PORT = 5197;
// Set to run a second suite beside another checkout's: outside CI a running server is reused.
const PORT = Number(process.env.LOADOUT_UI_TEST_PORT) || DEFAULT_PORT;
const BASE_URL = `http://localhost:${PORT}/`;
const CI = Boolean(process.env.CI);
const SERVER_START_TIMEOUT_MS = 120_000;
const SERVER_STOP_TIMEOUT_MS = 10_000;
// Real Git and real files behind every click: slower than the page alone, most of all on a busy
// machine.
const TEST_TIMEOUT_MS = 60_000;
const EXPECT_TIMEOUT_MS = 15_000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"]] : "list",
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
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
    // Asked to stop rather than killed, so each session removes its temporary home.
    gracefulShutdown: { signal: "SIGTERM", timeout: SERVER_STOP_TIMEOUT_MS },
  },
});
