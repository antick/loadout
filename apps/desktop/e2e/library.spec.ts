import { activityBar, expect, main, openApp, test, toasts } from "./app";

test("delete a skill, then restore it from Recently removed", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  const card = content.getByRole("heading", { name: "api-docs", level: 3 });
  await expect(card).toBeVisible();

  await content.getByRole("button", { name: "Delete api-docs" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Delete “api-docs”?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete skill" }).click();

  await expect(toasts(page).getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(card).toHaveCount(0);

  await activityBar(page).getByRole("button", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Storage" }).click();
  const removed = content.getByRole("listitem").filter({ hasText: "api-docs" });
  await expect(removed).toBeVisible();
  await removed.getByRole("button", { name: "Restore" }).click();
  await expect(removed).toHaveCount(0);

  await activityBar(page).getByRole("button", { name: "Library" }).click();
  await expect(card).toBeVisible();
});

test("select two skills, tag them, then delete them", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  const selectTwo = async (): Promise<void> => {
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await content.getByRole("checkbox", { name: "Select api-docs" }).check();
    await content.getByRole("checkbox", { name: "Select release-notes" }).check();
  };

  await selectTwo();
  await page.getByRole("button", { name: "Tags…" }).click();
  const tagDialog = page.getByRole("dialog");
  await expect(tagDialog.getByRole("heading", { name: "Edit tags of 2 skills" })).toBeVisible();
  const tagInput = tagDialog.getByRole("textbox", { name: "Add tags" });
  await tagInput.fill("docs");
  await tagInput.press("Enter");
  await tagDialog.getByRole("button", { name: "Save" }).click();
  await expect(toasts(page).filter({ hasText: "Updated tags of 2 skills" })).toBeVisible();

  // Saving the tags leaves selection mode. The new tag filters down to the two skills.
  const tagFilter = content.getByRole("group", { name: "Filter by tag" });
  await tagFilter.getByRole("button", { name: "docs" }).click();
  await expect(content.getByRole("heading", { level: 3 })).toHaveText([
    "api-docs",
    "release-notes",
  ]);
  await tagFilter.getByRole("button", { name: "All" }).click();

  await selectTwo();
  await page.getByRole("button", { name: "Delete 2" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("heading", { name: "Delete 2 skills?" })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete 2 skills" }).click();

  await expect(toasts(page).getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(content.getByRole("heading", { name: "api-docs", level: 3 })).toHaveCount(0);
  await expect(content.getByRole("heading", { name: "release-notes", level: 3 })).toHaveCount(0);
  await expect(content.getByRole("heading", { name: "code-review", level: 3 })).toBeVisible();
});
