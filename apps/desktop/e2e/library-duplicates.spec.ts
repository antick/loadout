import type { Locator, Page } from "@playwright/test";
import { expect, main, openApp, test, toasts } from "./app";

// The pair is named in the order of the two skills' ids, which each seed draws afresh.
const PAIR = /^(code-review and diff-review|diff-review and code-review)$/;

/** Open the duplicates and ask for the slow look at the text: the seed's pair is alike by text. */
async function findSimilarText(page: Page): Promise<Locator> {
  // The header buttons sit in the title bar, outside the main region.
  await page.getByRole("button", { name: "More library actions" }).click();
  await page.getByRole("menuitem", { name: "Find duplicates" }).click();
  const dialog = page.getByRole("dialog", { name: "Possible duplicates" });
  await expect(dialog.getByText("No duplicates found")).toBeVisible();
  await dialog.getByRole("button", { name: "Look for similar text" }).click();
  return dialog;
}

test("review a possible duplicate, compare it, keep one and undo", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  // Alike text is only looked for on request, so no notice says so up front.
  await expect(content.getByRole("heading", { name: "code-review", level: 3 })).toBeVisible();
  await expect(content.getByText("1 pair of skills may be duplicates.")).toHaveCount(0);

  const dialog = await findSimilarText(page);
  const pair = dialog.getByRole("article", { name: PAIR });
  await expect(pair).toBeVisible();

  await pair.getByRole("button", { name: "Compare text" }).click();
  await expect(pair.getByText("name: diff-review")).toBeVisible();

  await pair.getByRole("button", { name: "Keep diff-review" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Keep diff-review?" });
  await expect(confirm.getByText("Deployed to: codex and cursor")).toBeVisible();
  await confirm.getByRole("button", { name: "Remove code-review" }).click();

  await expect(dialog.getByText("No duplicates found")).toBeVisible();
  await expect(
    toasts(page).filter({ hasText: "Kept diff-review and removed code-review" }),
  ).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(dialog.getByRole("article", { name: PAIR })).toBeVisible();
});

test("mark a pair as different and bring it back", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  const dialog = await findSimilarText(page);
  await dialog.getByRole("button", { name: "Not a duplicate" }).click();
  await expect(dialog.getByText("No duplicates found")).toBeVisible();

  await dialog.getByRole("checkbox", { name: /Also show 1 pair marked as different/ }).click();
  const pair = dialog.getByRole("article", { name: PAIR });
  await expect(pair.getByText("Marked as different")).toBeVisible();
  await pair.getByRole("button", { name: "List again" }).click();
  await dialog.getByRole("button", { name: "Close" }).first().click();
  // The look at the text holds until the library changes.
  await expect(content.getByText("1 pair of skills may be duplicates.")).toBeVisible();
});
