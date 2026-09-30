import { expect, main, openApp, test } from "./app";

test("group the library by source, fold a section, and deploy one section", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  await content.getByRole("button", { name: "Group by source" }).click();

  const repo = content.getByRole("button", { name: "Fold or unfold example.com/acme/skills" });
  await expect(repo).toContainText("2 skills");
  const noSource = content.getByRole("button", { name: "Fold or unfold No source" });
  await expect(noSource).toBeVisible();
  // Sections keep the sort order: the repository's two skills come first on screen.
  await expect(content.getByRole("heading", { level: 3 }).first()).toHaveText("code-review");

  await repo.click();
  await expect(content.getByRole("heading", { name: "code-review", level: 3 })).toHaveCount(0);
  await expect(content.getByRole("heading", { name: "api-docs", level: 3 })).toBeVisible();
  await repo.click();
  await expect(content.getByRole("heading", { name: "code-review", level: 3 })).toBeVisible();

  await content.getByRole("button", { name: "Deploy to agents…" }).first().click();
  // Only the section's two skills, not the whole library.
  await expect(page.getByRole("dialog", { name: "Deploy 2 skills" })).toBeVisible();
  await page.keyboard.press("Escape");

  await content.getByRole("button", { name: "Group by source" }).click();
  await expect(repo).toHaveCount(0);
});
