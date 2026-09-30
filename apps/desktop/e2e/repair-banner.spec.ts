import { activityBar, expect, test } from "./app";

test("a deployment that could not be put back shows in a banner until dismissed", async ({
  page,
}) => {
  await page.goto("/?repair=failed#/library");
  await expect(activityBar(page)).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: "could not be put back" });
  await expect(banner).toContainText(
    "release-notes (Cursor): A folder that Loadout did not create",
  );
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
});

test("retrying the repair clears the banner when everything is back", async ({ page }) => {
  await page.goto("/?repair=failed#/library");
  await expect(activityBar(page)).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: "could not be put back" });
  await banner.getByRole("button", { name: "Retry" }).click();
  await expect(banner).toHaveCount(0);
});
