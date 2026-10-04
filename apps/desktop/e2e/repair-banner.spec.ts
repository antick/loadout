import { expect, openApp, setUp, test } from "./app";

test("a deployment that could not be put back shows in a banner until dismissed", async ({
  page,
}) => {
  // A folder of someone else's sits where release-notes was deployed for Cursor.
  await setUp(page, "repair-failed");
  await openApp(page, "/library");
  const banner = page.getByRole("status").filter({ hasText: "could not be put back" });
  await expect(banner).toContainText("release-notes (Cursor): Refusing to replace");
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
});

test("retrying the repair clears the banner when everything is back", async ({ page }) => {
  await setUp(page, "repair-failed");
  await openApp(page, "/library");
  const banner = page.getByRole("status").filter({ hasText: "could not be put back" });
  await expect(banner).toBeVisible();
  // The folder in the way is moved aside, so the retry can put the deployment back.
  await setUp(page, "repair-unblocked");
  await banner.getByRole("button", { name: "Retry" }).click();
  await expect(banner).toHaveCount(0);
});
