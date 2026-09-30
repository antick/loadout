import { activityBar, expect, main, openApp, test, toasts } from "./app";

test("publish a skill to ClawHub from its menu", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  await content
    .getByRole("button", { name: "code-review", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Publish to ClawHub…" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish code-review to ClawHub" });
  await expect(dialog.getByText("Publishing as @maria-dev.")).toBeVisible();
  await expect(dialog.getByText("Latest published version: 1.2.0.")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Version", exact: true })).toHaveValue("1.2.1");
  await expect(dialog.getByText("2 files, 7.3 kB")).toBeVisible();
  const publish = dialog.getByRole("button", { name: "Publish v1.2.1" });
  await expect(publish).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await publish.click();
  const done = page.getByRole("dialog", { name: "Published to ClawHub" });
  await expect(done.getByText("@maria-dev/code-review@1.2.1 is live on ClawHub.")).toBeVisible();
  await expect(done.getByText("loadout skills install @maria-dev/code-review")).toBeVisible();
});

test("the Marketplaces settings keep the ClawHub token", async ({ page }) => {
  // The mock reads `?clawhub=none` from the page address; the section is picked from the sidebar.
  await page.goto("/?clawhub=none#/settings");
  await expect(activityBar(page)).toBeVisible();
  await activityBar(page).getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Settings sidebar").getByRole("link", { name: "Marketplaces" }).click();
  const content = main(page);
  await expect(content.getByText("No token saved.")).toBeVisible();
  await content.getByLabel("API token").fill("clh_bad_one");
  await content.getByRole("button", { name: "Save token" }).click();
  await expect(toasts(page).filter({ hasText: "ClawHub refused the token" })).toBeVisible();
  await content.getByLabel("API token").fill("clh_good_one");
  await content.getByRole("button", { name: "Save token" }).click();
  await expect(content.getByText("Signed in as @maria-dev.")).toBeVisible();
  await content.getByRole("button", { name: "Forget" }).click();
  await expect(content.getByText("No token saved.")).toBeVisible();
});
