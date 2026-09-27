import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * Every test gets a fresh page, so the in-memory preview bridge starts from its seed data each
 * time. A test fails when the page throws an uncaught error, even if every assertion passed.
 */
export const test = base.extend<{ pageErrors: Error[] }>({
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

/**
 * Opens a hash route (such as `/library` or `/settings?section=storage`) once the shell is up.
 * This loads the page, so the preview data goes back to its seed: move within a test by clicking.
 */
export async function openApp(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  await expect(activityBar(page)).toBeVisible();
}
