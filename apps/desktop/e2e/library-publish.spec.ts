import { expect, main, openApp, test } from "./app";
import type { Page } from "@playwright/test";

/**
 * `acme/skills` holds older react-patterns and test-first already; diff-review is new to it.
 * api-docs has a token pasted into its reference.md.
 */
const CLEAN = ["diff-review", "react-patterns", "test-first"];
const WITH_KEY = ["api-docs", "diff-review", "react-patterns"];

/** Select skills and open the publish dialog from the Share menu. */
async function openPublish(page: Page, names: string[]) {
  await openApp(page, "/library");
  const content = main(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  for (const name of names) {
    await content.getByRole("checkbox", { name: `Select ${name}` }).check();
  }
  await content.getByRole("button", { name: "Share…" }).click();
  await page.getByRole("menuitem", { name: "Publish to a repository…" }).click();
  return page.getByRole("dialog", { name: `Publish ${names.length} skills` });
}

test("check a repository, publish, and copy the install commands", async ({ page }) => {
  const dialog = await openPublish(page, CLEAN);
  await dialog.getByLabel("Repository").fill("acme/skills");
  await dialog.getByRole("button", { name: "Check" }).click();

  await expect(dialog.getByText("Goes to main.")).toBeVisible();
  // diff-review is new there; react-patterns gained a file and changed one.
  await expect(dialog.getByText("1 added, 1 changed, 0 removed")).toBeVisible();
  await expect(dialog.getByText("Left out: .env, node_modules/")).toBeVisible();
  // Nothing is sent until Publish.
  await dialog.getByRole("button", { name: "Publish 3 skills" }).click();

  // The dialog is named after what it shows: the result, not the form.
  const result = page.getByRole("dialog", { name: "Published" });
  await expect(result.getByText(/Published 3 skills/)).toBeVisible();
  await expect(result.getByText("npx skills add acme/skills --skill diff-review")).toBeVisible();
  await result.getByRole("button", { name: "Done" }).click();
  await expect(result).toBeHidden();
  // The selection ends once the skills went out.
  await expect(page.getByRole("toolbar", { name: "Selection actions" })).toBeHidden();
});

test("holds back a key until the person says it is safe", async ({ page }) => {
  const dialog = await openPublish(page, WITH_KEY);
  await dialog.getByLabel("Repository").fill("acme/skills");
  await dialog.getByRole("button", { name: "Check" }).click();

  await expect(dialog.getByText(/This looks like a key or token/)).toBeVisible();
  await expect(dialog.getByText("skills/api-docs/reference.md:14 GitHub token")).toBeVisible();
  const publish = dialog.getByRole("button", { name: "Publish 3 skills" });
  await expect(publish).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "I checked. It is safe to share." }).check();
  await expect(publish).toBeEnabled();
});

test("shows the reason in the dialog when the repository cannot be reached", async ({ page }) => {
  const dialog = await openPublish(page, CLEAN);
  // No such repository on the preview's GitHub.
  await dialog.getByLabel("Repository").fill("acme/bad-repo");
  await dialog.getByRole("button", { name: "Check" }).click();
  await expect(dialog.getByText(/Git could not finish the operation/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Check" })).toBeEnabled();
  // Changing the address clears the message.
  await dialog.getByLabel("Repository").fill("acme/skills");
  await expect(dialog.getByText(/Git could not finish the operation/)).toBeHidden();
});

test("the last repository is filled in next time", async ({ page }) => {
  const dialog = await openPublish(page, CLEAN);
  await dialog.getByLabel("Repository").fill("acme/skills");
  await dialog.getByLabel("Branch").fill("release");
  await dialog.getByRole("button", { name: "Check" }).click();
  await expect(dialog.getByText("The branch release is new.")).toBeVisible();
  await dialog.getByRole("button", { name: /Publish 3 skills/ }).click();
  await page
    .getByRole("dialog", { name: "Published" })
    .getByRole("button", { name: "Done" })
    .click();

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await main(page).getByRole("checkbox", { name: "Select api-docs" }).check();
  await main(page).getByRole("button", { name: "Share…" }).click();
  await page.getByRole("menuitem", { name: "Publish to a repository…" }).click();
  const again = page.getByRole("dialog", { name: "Publish 1 skill" });
  await expect(again.getByLabel("Repository")).toHaveValue("https://github.com/acme/skills.git");
  await expect(again.getByLabel("Branch")).toHaveValue("release");
});
