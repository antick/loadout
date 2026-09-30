import { activityBar, expect, main, openApp, test } from "./app";

test("pick the editor the open buttons use", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  await content.getByRole("button", { name: "code-review", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "code-review" });
  // The header has one; the file path row under Document has another.
  await expect(panel.getByRole("button", { name: "Open in default app" }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await activityBar(page).getByRole("button", { name: "Settings" }).click();
  await page.getByRole("link", { name: "General" }).click();
  await content.getByRole("combobox", { name: "Open in editor" }).click();
  await page.getByRole("option", { name: "Cursor" }).click();

  await activityBar(page).getByRole("button", { name: "Library" }).click();
  await content.getByRole("button", { name: "code-review", exact: true }).click();
  const open = panel.getByRole("button", { name: "Open in Cursor" }).first();
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByText("Could not open")).toHaveCount(0);
});
