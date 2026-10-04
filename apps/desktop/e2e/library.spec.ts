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

test("the Sources page groups skills by where they came from and opens them in the library", async ({
  page,
}) => {
  await openApp(page, "/library");
  await activityBar(page).getByRole("button", { name: "Library" }).click();
  await page.getByRole("link", { name: /^Sources/ }).click();
  const content = main(page);
  const source = content.getByRole("article", { name: "example.com/acme/skills" });
  await expect(source).toBeVisible();
  await expect(source.getByText("2 skills")).toBeVisible();
  await expect(source.getByRole("button", { name: "Update 1" })).toBeVisible();

  await source.getByRole("button", { name: "More for example.com/acme/skills" }).click();
  await page.getByRole("menuitem", { name: "Show in library" }).click();
  await expect(content.getByRole("heading", { name: "code-review", level: 3 })).toBeVisible();
  await expect(content.getByRole("heading", { name: "sql-migrations", level: 3 })).toBeVisible();
  await expect(content.getByRole("heading", { name: "api-docs", level: 3 })).toHaveCount(0);
});

test("a source card shows new skills, opens them ticked, and forgets them on request", async ({
  page,
}) => {
  await openApp(page, "/library");
  await activityBar(page).getByRole("button", { name: "Library" }).click();
  await page.getByRole("link", { name: /^Sources/ }).click();
  const source = main(page).getByRole("article", { name: "example.com/acme/skills" });
  await expect(source.getByText("2 new skills")).toBeVisible();
  await expect(
    source.getByText("New since you last looked: log-triage, terraform-review."),
  ).toBeVisible();

  await source.getByRole("button", { name: "Add them…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Import selected (2)" })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Select log-triage" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Select api-design" })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await source.getByRole("button", { name: "Not interested" }).click();
  await expect(source.getByText("2 new skills")).toHaveCount(0);
});

test("a skill removed elsewhere while its panel is open closes the panel", async ({ page }) => {
  await openApp(page, "/library");
  await main(page).getByRole("button", { name: "api-docs", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "api-docs" }).first()).toBeVisible();

  // As the command line or a sync from another computer would.
  await page.evaluate(`(async () => {
    const { value: skills } = await window.loadout.invoke("skills.list", []);
    const target = skills.find((skill) => skill.name === "api-docs");
    await window.loadout.invoke("skills.removeMany", [[target.id]]);
  })()`);

  await expect(panel).toHaveCount(0);
});
