import type { Page } from "@playwright/test";
import { expect, main, openApp, setUp, test } from "./app";

const SCREENSHOTS = process.env.LOADOUT_UI_SCREENSHOTS;

/** Run a backup scenario (another device syncing the same backup), then open the Backup page. */
async function openBackup(page: Page, scenario?: string): Promise<void> {
  if (scenario) await setUp(page, scenario);
  await openApp(page, "/backup");
}

test("Sync now shows what comes in first, with each skill's files", async ({ page }) => {
  // Work Laptop changed code-review, deleted old-notes and a preset; this computer tagged a skill.
  await openBackup(page, "backup-incoming");
  await main(page).getByRole("button", { name: "Sync now" }).click();

  const dialog = page.getByRole("dialog", { name: "Review the sync" });
  await expect(dialog.getByRole("heading", { name: "Coming in" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Going out from this computer" })).toBeVisible();
  await expect(dialog.getByText("from Work Laptop").first()).toBeVisible();
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
  await openBackup(page, "backup-many-deletions");
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
  // Both computers changed release-notes and sql-helper between syncs.
  await openBackup(page, "backup-conflicts");
  const row = main(page).getByRole("listitem").filter({ hasText: "release-notes" });
  await row.getByRole("button", { name: "Compare" }).click();

  const dialog = page.getByRole("dialog", { name: "Compare “release-notes”" });
  await expect(dialog.getByText("SKILL.md")).toBeVisible();
  await expect(dialog.getByText(/^- This computer$/)).toBeVisible();
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/conflict-compare.png` });
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);
});

test("several conflicts take one choice for all, after a confirmation", async ({ page }) => {
  await openBackup(page, "backup-conflicts");
  const content = main(page);
  await expect(content.getByText("sql-helper")).toBeVisible();
  await content.getByRole("button", { name: "Use all remote" }).click();

  const ask = page.getByRole("alertdialog", { name: "Replace 2 skills with the remote versions?" });
  await ask.getByRole("button", { name: "Use all remote" }).click();
  await expect(page.getByText("2 skills now use the remote version")).toBeVisible();
  await expect(content.getByRole("heading", { name: "Needs attention" })).toHaveCount(0);
});

test("a long review can be searched; keep-all answers for the rows shown", async ({ page }) => {
  // Work Laptop deleted six skills and changed commit-helper.
  await openBackup(page, "backup-many-deletions");
  await main(page).getByRole("button", { name: "Sync now" }).click();

  const dialog = page.getByRole("dialog", { name: "Review the sync" });
  const search = dialog.getByRole("searchbox", { name: "Search skills or devices" });
  await search.fill("er");
  await expect(dialog.getByRole("radiogroup")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Keep all" }).click();
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/sync-review-filter.png` });

  await search.fill("nothing-like-it");
  await expect(dialog.getByText("No skill in this sync fits the search.")).toBeVisible();
  await dialog.getByRole("button", { name: "Clear search" }).click();
  await expect(dialog.getByText("commit-helper")).toBeVisible();
  const answer = (name: string) =>
    dialog.getByRole("radiogroup", { name: `What to do with ${name}` });
  await expect(answer("sql-helper").getByRole("radio", { name: "Keep" })).toBeChecked();
  await expect(answer("test-writer").getByRole("radio", { name: "Keep" })).toBeChecked();
  await expect(answer("pdf-tools").getByRole("radio", { name: "Delete here" })).toBeChecked();
});

test("the review says when the library changed meanwhile, and Recheck refreshes it", async ({
  page,
}) => {
  await openBackup(page, "backup-incoming");
  await main(page).getByRole("button", { name: "Sync now" }).click();

  const dialog = page.getByRole("dialog", { name: "Review the sync" });
  const notice = dialog.getByText(/changed since this review/);
  await expect(dialog.getByRole("heading", { name: "Coming in" })).toBeVisible();
  await expect(notice).toHaveCount(0);

  // Anything that changes the library, as an editor would while the review is open.
  await page.evaluate(`(async () => {
    const { value: skills } = await window.loadout.invoke("skills.list", []);
    const target = skills.find((skill) => skill.name === "release-notes");
    await window.loadout.invoke("editor.createFile", [
      { kind: "library", skillId: target.id },
      "notes.md",
    ]);
  })()`);
  await expect(notice).toBeVisible();
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/sync-review-stale.png` });

  await dialog.getByRole("button", { name: "Recheck" }).click();
  await expect(notice).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "Coming in" })).toBeVisible();
});

test("own patterns are saved, and one that drops whole skills is refused", async ({ page }) => {
  await openBackup(page);
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
  await openBackup(page, "backup-up-to-date");
  const content = main(page);
  await content.getByRole("button", { name: "Back up again" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  // One line names the stage while it runs (checking, saving, downloading, merging, uploading).
  const stage = content.getByText(/^(Checking|Saving|Downloading|Merging|Uploading) .*…$/);
  await expect(stage).toBeVisible();
  await expect(stage).toHaveCount(0);
});

test("a public GitHub repository is only used after the user agrees", async ({ page }) => {
  await openBackup(page, "backup-no-remote");
  const content = main(page);
  const repoName = content.getByLabel("Repository name");
  const connect = async (name: string): Promise<void> => {
    await repoName.fill(name);
    await content.getByLabel("Personal access token").fill("ghp_example");
    await content.getByRole("button", { name: "Connect" }).click();
  };

  await connect("public-skills");
  const ask = page.getByRole("alertdialog", { name: "dev/public-skills is public" });
  await expect(ask).toBeVisible();
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/public-repo.png` });
  await ask.getByRole("button", { name: "Don't connect" }).click();
  await expect(ask).toHaveCount(0);
  await expect(content.getByText("public-skills")).toHaveCount(0);

  await connect("public-skills");
  await ask.getByRole("button", { name: "Use the public repository" }).click();
  await expect(page.getByText("Connected to github.com/dev/public-skills")).toBeVisible();
});
