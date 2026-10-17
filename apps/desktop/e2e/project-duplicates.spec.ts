import { expect, main, openApp, setUp, test } from "./app";
import type { Page } from "@playwright/test";

const SCREENSHOTS = process.env.LOADOUT_SCREENSHOTS;
async function openResolution(page: Page) {
  await main(page).getByRole("button", { name: "code-review", exact: true }).click();
  await page.getByRole("button", { name: "Resolve duplicates", exact: true }).click();
  return page.getByRole("dialog", { name: "Resolve duplicates of “code-review”" });
}
async function openProject(page: Page) {
  await openApp(page, "/projects");
  await main(page)
    .getByRole("link", { name: "Open project “billing-api”" })
    .click({ position: { x: 12, y: 12 } });
}

test("preview, cancel, resolve, reopen and undo identical project copies", async ({ page }) => {
  await setUp(page, "project-copies-identical");
  await openProject(page);
  let dialog = await openResolution(page);
  await expect(
    dialog.getByText("These copies contain identical files and permissions."),
  ).toBeVisible();
  await expect(dialog.getByText("Already linked (kept as they are)")).toBeVisible();
  await expect(dialog.getByText(/These locations are shortcuts/)).toBeVisible();
  await expect(dialog.getByText(/\.pi\/skills\/code-review/)).toBeVisible();
  if (SCREENSHOTS)
    await page.screenshot({ animations: "disabled", path: `${SCREENSHOTS}/duplicate-preview.png` });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Resolve duplicates", exact: true }).click();
  await dialog.getByRole("button", { name: "Resolve duplicates", exact: true }).click();
  await expect(dialog.getByText(/Duplicate copies resolved/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  // Reload the renderer: Undo comes from persisted core state, not a success-toast closure.
  await page.reload();
  dialog = await openResolution(page);
  await expect(dialog.getByRole("button", { name: "Undo resolution" })).toBeVisible();
  await dialog.getByRole("button", { name: "Undo resolution" }).click();
  await expect(
    dialog.getByText("These copies contain identical files and permissions."),
  ).toBeVisible();
});

test("different copies show comparison without an apply button", async ({ page }) => {
  await setUp(page, "project-copies-differ");
  await openProject(page);
  const dialog = await openResolution(page);
  await expect(dialog.getByText(/These copies differ/)).toBeVisible();
  await expect(dialog.getByText("SKILL.md", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Resolve duplicates", exact: true })).toHaveCount(
    0,
  );
  if (SCREENSHOTS)
    await page.screenshot({
      animations: "disabled",
      path: `${SCREENSHOTS}/duplicate-differences.png`,
    });
});

test("the resolution preview stays inside a narrow window", async ({ page }) => {
  await setUp(page, "project-copies-identical");
  await openProject(page);
  const dialog = await openResolution(page);
  await expect(
    dialog.getByText("These copies contain identical files and permissions."),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 700 });
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  await dialog
    .getByRole("button", { name: "Resolve duplicates", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Resolve duplicates", exact: true }),
  ).toBeInViewport();
  if (SCREENSHOTS)
    await page.screenshot({ animations: "disabled", path: `${SCREENSHOTS}/duplicate-narrow.png` });
});
