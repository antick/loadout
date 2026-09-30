import { expect, main, openApp, test } from "./app";
import type { Page } from "@playwright/test";

/** Select three skills and open the publish dialog from the Share menu. */
async function openPublish(page: Page) {
  await openApp(page, "/library");
  const content = main(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  for (const name of ["api-docs", "diff-review", "react-patterns"]) {
    await content.getByRole("checkbox", { name: `Select ${name}` }).check();
  }
  await content.getByRole("button", { name: "Share…" }).click();
  await page.getByRole("menuitem", { name: "Publish to a repository…" }).click();
  return page.getByRole("dialog", { name: "Publish 3 skills" });
}

test("check a repository, publish, and copy the install commands", async ({ page }) => {
  const dialog = await openPublish(page);
  await dialog.getByLabel("Repository").fill("acme/skills");
  await dialog.getByRole("button", { name: "Check" }).click();

  await expect(dialog.getByText("Goes to main.")).toBeVisible();
  await expect(dialog.getByText("1 added, 2 changed, 0 removed")).toBeVisible();
  await expect(dialog.getByText("Left out: node_modules/, .env")).toBeVisible();
  // Nothing is sent until Publish.
  await dialog.getByRole("button", { name: "Publish 2 skills" }).click();

  // The dialog is named after what it shows: the result, not the form.
  const result = page.getByRole("dialog", { name: "Published" });
  await expect(result.getByText(/Published 2 skills/)).toBeVisible();
  await expect(result.getByText("npx skills add acme/skills --skill api-docs")).toBeVisible();
  await result.getByRole("button", { name: "Done" }).click();
  await expect(result).toBeHidden();
  // The selection ends once the skills went out.
  await expect(page.getByRole("toolbar", { name: "Selection actions" })).toBeHidden();
});

test("holds back a key until the person says it is safe", async ({ page }) => {
  const dialog = await openPublish(page);
  await dialog.getByLabel("Repository").fill("acme/secret-skills");
  await dialog.getByRole("button", { name: "Check" }).click();

  await expect(dialog.getByText(/This looks like a key or token/)).toBeVisible();
  await expect(dialog.getByText("skills/react-patterns/notes.md:12 GitHub token")).toBeVisible();
  const publish = dialog.getByRole("button", { name: "Publish 2 skills" });
  await expect(publish).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "I checked. It is safe to share." }).check();
  await expect(publish).toBeEnabled();
});

test("shows the reason in the dialog when the repository cannot be reached", async ({ page }) => {
  const dialog = await openPublish(page);
  await dialog.getByLabel("Repository").fill("acme/bad-repo");
  await dialog.getByRole("button", { name: "Check" }).click();
  await expect(dialog.getByText("Could not reach the repository.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Check" })).toBeEnabled();
  // Changing the address clears the message.
  await dialog.getByLabel("Repository").fill("acme/skills");
  await expect(dialog.getByText("Could not reach the repository.")).toBeHidden();
});

test("the last repository is filled in next time", async ({ page }) => {
  const dialog = await openPublish(page);
  await dialog.getByLabel("Repository").fill("acme/skills");
  await dialog.getByLabel("Branch").fill("release");
  await dialog.getByRole("button", { name: "Check" }).click();
  await expect(dialog.getByText("The branch release is new.")).toBeVisible();
  await dialog.getByRole("button", { name: /Publish 2 skills/ }).click();
  await page
    .getByRole("dialog", { name: "Published" })
    .getByRole("button", { name: "Done" })
    .click();

  // Move within the page: opening it again reloads the seed data.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await main(page).getByRole("checkbox", { name: "Select api-docs" }).check();
  await main(page).getByRole("button", { name: "Share…" }).click();
  await page.getByRole("menuitem", { name: "Publish to a repository…" }).click();
  const again = page.getByRole("dialog", { name: "Publish 1 skill" });
  await expect(again.getByLabel("Repository")).toHaveValue("acme/skills");
  await expect(again.getByLabel("Branch")).toHaveValue("release");
});
