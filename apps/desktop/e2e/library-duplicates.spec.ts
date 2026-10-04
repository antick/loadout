import { expect, main, openApp, test, toasts } from "./app";

// The pair is named in the order of the two skills' ids, which each seed draws afresh.
const PAIR = /^(code-review and diff-review|diff-review and code-review)$/;

test("review a possible duplicate, compare it, keep one and undo", async ({ page }) => {
  await openApp(page, "/library");
  const content = main(page);
  await expect(content.getByText("1 pair of skills may be duplicates.")).toBeVisible();
  await content.getByRole("button", { name: "Review", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Possible duplicates" });
  const pair = dialog.getByRole("article", { name: PAIR });
  await expect(pair).toBeVisible();

  await pair.getByRole("button", { name: "Compare text" }).click();
  await expect(pair.getByText("name: diff-review")).toBeVisible();

  await pair.getByRole("button", { name: "Keep diff-review" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Keep diff-review?" });
  await expect(confirm.getByText("Deployed to: codex, cursor")).toBeVisible();
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
  await content.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Possible duplicates" });
  await dialog.getByRole("button", { name: "Not a duplicate" }).click();
  await expect(dialog.getByText("No duplicates found")).toBeVisible();

  await dialog.getByRole("checkbox", { name: /Also show 1 pair marked as different/ }).click();
  const pair = dialog.getByRole("article", { name: PAIR });
  await expect(pair.getByText("Marked as different")).toBeVisible();
  await pair.getByRole("button", { name: "List again" }).click();
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(content.getByText("1 pair of skills may be duplicates.")).toBeVisible();
});
