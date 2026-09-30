import { activityBar, expect, main, openApp, test } from "./app";

test("star a skill, show favourites only, and unstar it from the panel", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  const headings = content.getByRole("heading", { level: 3 });
  await content.getByRole("button", { name: "Add api-docs to favourites" }).click();

  await content.getByRole("button", { name: "Favourites only" }).click();
  await expect(headings).toHaveText(["api-docs", "code-review"]);

  await content.getByRole("button", { name: "api-docs", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "api-docs" });
  await panel.getByRole("button", { name: "Remove api-docs from favourites" }).click();
  await page.keyboard.press("Escape");
  await expect(headings).toHaveText(["code-review"]);
});

test("the sidebar opens the library on favourites only", async ({ page }) => {
  await openApp(page, "/library");
  await activityBar(page).getByRole("button", { name: "Library" }).click();
  await page.getByRole("link", { name: "Favourites" }).click();
  await expect(main(page).getByRole("button", { name: "Favourites only" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(main(page).getByRole("heading", { level: 3 })).toHaveText(["code-review"]);
});
