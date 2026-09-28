import { activityBar, expect, main, openApp, test } from "./app";

const SCREENSHOTS = process.env.LOADOUT_UI_SCREENSHOTS;

test("Sync now shows what comes in first, with each skill's files", async ({ page }) => {
  await openApp(page, "/backup");
  await main(page).getByRole("button", { name: "Sync now" }).click();

  const dialog = page.getByRole("dialog", { name: "Review the sync" });
  await expect(dialog.getByRole("heading", { name: "Coming in" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Going out from this computer" })).toBeVisible();
  await expect(dialog.getByText("was review · from Work Laptop")).toBeVisible();
  await expect(dialog.getByText("1 preset is updated from another device.")).toBeVisible();

  // Files of one skill, this computer against the other device.
  await dialog.getByRole("button", { name: "View changes" }).first().click();
  await expect(dialog.getByText("examples.md")).toBeVisible();
  await expect(dialog.getByText(/^\+ Other device$/).first()).toBeVisible();

  // A deletion is the one choice: it starts as "delete here", like a sync without a review.
  const choice = dialog.getByRole("radiogroup", { name: "What to do with old-notes" });
  await expect(choice.getByRole("radio", { name: "Delete here" })).toBeChecked();
  await choice.getByRole("radio", { name: "Keep" }).click();
  await expect(choice.getByRole("radio", { name: "Keep" })).toBeChecked();
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/sync-review.png` });

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("many deletions get a warning and a keep-all", async ({ page }) => {
  await page.goto("/?review=many#/backup");
  await expect(activityBar(page)).toBeVisible();
  await main(page).getByRole("button", { name: "Sync now" }).click();

  const dialog = page.getByRole("dialog", { name: "Review the sync" });
  await expect(dialog.getByText(/This sync deletes 6 skills here/)).toBeVisible();
  await dialog.getByRole("button", { name: "Keep all" }).click();
  for (const name of ["pdf-tools", "test-writer"]) {
    const choice = dialog.getByRole("radiogroup", { name: `What to do with ${name}` });
    await expect(choice.getByRole("radio", { name: "Keep" })).toBeChecked();
  }
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/sync-review-many.png` });
});

test("a conflict can be compared file by file before choosing", async ({ page }) => {
  await openApp(page, "/backup");
  await main(page).getByRole("button", { name: "Compare" }).click();

  const dialog = page.getByRole("dialog", { name: "Compare “release-notes”" });
  await expect(dialog.getByText("SKILL.md")).toBeVisible();
  await expect(dialog.getByText(/^- This computer$/)).toBeVisible();
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/conflict-compare.png` });
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);
});

test("own patterns are saved, and one that drops whole skills is refused", async ({ page }) => {
  await openApp(page, "/backup");
  const card = main(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Left out of the backup" }) });
  const field = card.getByRole("textbox", { name: "Your patterns" });
  await expect(card.getByText("node_modules/", { exact: true })).toBeVisible();
  await expect(field).toHaveValue("outputs/");

  await field.fill("outputs/\nSKILL.md");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText(/would leave whole skills/)).toBeVisible();

  await field.fill("outputs/\n*.zip");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText(/would leave whole skills/)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(field).toHaveValue("outputs/\n*.zip");
  if (SCREENSHOTS) await card.screenshot({ path: `${SCREENSHOTS}/ignore-card.png` });
});

test("a sync with nothing coming in runs straight away and shows its stages", async ({ page }) => {
  await page.goto("/?backup=uptodate#/backup");
  await expect(activityBar(page)).toBeVisible();
  const content = main(page);
  await content.getByRole("button", { name: "Back up again" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  // One line names the stage while it runs (checking, saving, downloading, merging, uploading).
  const stage = content.getByText(/^(Checking|Saving|Downloading|Merging|Uploading) .*…$/);
  await expect(stage).toBeVisible();
  await expect(stage).toHaveCount(0);
});
