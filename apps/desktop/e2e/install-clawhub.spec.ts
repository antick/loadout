import { expect, main, openApp, test, toasts } from "./app";

test("switch the marketplace to ClawHub, read a skill and install it", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  await content.getByRole("radio", { name: "ClawHub" }).click();
  await expect(content.getByRole("radio", { name: "Most downloaded" })).toBeVisible();
  await expect(content.getByPlaceholder("Search ClawHub")).toBeVisible();

  const card = content.getByRole("article").filter({ hasText: "React patterns" }).first();
  await expect(card).toContainText("v1.0.0");
  await card.getByRole("button", { name: /Details of/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("What changed in v1.0.0")).toBeVisible();
  await expect(sheet.getByText("ClawHub scan")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Repository" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Install" }).click();
  await expect(toasts(page).filter({ hasText: "Installed react-patterns" })).toBeVisible();
  await expect(sheet.getByText("In your library")).toBeVisible();
});
