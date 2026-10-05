import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { ApiResponse } from "@loadout/shared";
import { DEV_API_PREFIX, DEV_ROUTES, DEV_SESSION_COOKIE, fromWire } from "../dev-server/wire";

/** The first test of a worker waits for its session to seed a library (a few seconds). */
const SESSION_TIMEOUT_MS = 120_000;
/** Posted with an empty JSON body: the dev server refuses any other kind of POST. */
const RESET_URL = `${DEV_API_PREFIX}${DEV_ROUTES.reset}`;

/** A dev server reply that must be `ok`; its error message otherwise fails the test. */
async function expectOk(response: { text(): Promise<string> }): Promise<void> {
  const reply = fromWire(await response.text()) as ApiResponse<unknown>;
  expect(reply.ok ? null : reply.error.message).toBeNull();
}

/**
 * Every test runs on the real core in its worker's own session (`dev-server/plugin.ts`), put back
 * to the seed before the test starts. A test fails when the page throws an uncaught error, even
 * if every assertion passed.
 */
export const test = base.extend<
  { pageErrors: Error[]; session: string },
  { workerSession: string }
>({
  // Seeding happens once per worker, on its own clock rather than the first test's.
  workerSession: [
    async ({ playwright }, use, workerInfo) => {
      const session = `ui-${workerInfo.parallelIndex}`;
      const request = await playwright.request.newContext({
        baseURL: workerInfo.project.use.baseURL,
        extraHTTPHeaders: { cookie: `${DEV_SESSION_COOKIE}=${session}` },
      });
      await expectOk(await request.post(RESET_URL, { data: {}, timeout: SESSION_TIMEOUT_MS }));
      await request.dispose();
      await use(session);
    },
    { scope: "worker", timeout: SESSION_TIMEOUT_MS },
  ],
  session: [
    async ({ context, baseURL, workerSession }, use) => {
      await context.addCookies([{ name: DEV_SESSION_COOKIE, value: workerSession, url: baseURL }]);
      await expectOk(await context.request.post(RESET_URL, { data: {} }));
      await use(workerSession);
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await use(errors);
      expect(errors.map((error) => error.message)).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Bring the session into a state the seed does not have, the way the app would get there (see
 * `dev-server/session/scenarios.ts`). Call it before opening the page.
 */
export async function setUp(page: Page, scenario: string): Promise<void> {
  await expectOk(
    await page.request.post(`${DEV_API_PREFIX}${DEV_ROUTES.setup}`, { data: { scenario } }),
  );
}

/** The icon strip on the left that switches sections. */
export function activityBar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Activity bar" });
}

/** The page's own content, without the sidebar and title bar. */
export function main(page: Page): Locator {
  return page.getByRole("main");
}

/** Toasts on screen (sonner), newest first. */
export function toasts(page: Page): Locator {
  return page.locator("[data-sonner-toast]");
}

/** Opens a hash route (such as `/library` or `/settings?section=storage`) once the shell is up. */
export async function openApp(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  await expect(activityBar(page)).toBeVisible();
}
