import { expect, main, openApp, test, toasts } from "./app";

test("keep a note on a skill and find the skill by it", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  await content.getByRole("button", { name: "api-docs", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "api-docs" });
  await panel.getByRole("button", { name: "Add a note" }).click();
  await panel
    .getByRole("textbox", { name: "Your note" })
    .fill("Regenerate after every endpoint change.");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page).filter({ hasText: "Note saved" })).toBeVisible();
  await expect(panel.getByText("Regenerate after every endpoint change.")).toBeVisible();
  await page.keyboard.press("Escape");

  await content
    .getByPlaceholder("Search name, description, tags, notes or source")
    .fill("endpoint change");
  await expect(content.getByRole("heading", { level: 3 })).toHaveText(["api-docs"]);
});

test("a seeded note shows on the card and can be taken off", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  await expect(
    content
      .getByRole("heading", { name: "sql-migrations", level: 3 })
      .locator("..")
      .getByText("Has a note", { exact: true }),
  ).toBeVisible();
  await content.getByRole("button", { name: "sql-migrations", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "sql-migrations" });
  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  await panel.getByRole("textbox", { name: "Your note" }).fill("");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page).filter({ hasText: "Note removed" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add a note" })).toBeVisible();
});
