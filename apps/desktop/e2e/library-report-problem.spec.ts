import { expect, main, openApp, test, toasts } from "./app";

test("prepare a report on a skill for its source repository, and copy it", async ({ page }) => {
  await openApp(page, "/library");
  await main(page).getByRole("button", { name: "code-review", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "code-review" });
  await panel.getByRole("tab", { name: "Source" }).click();
  await panel.getByRole("button", { name: "Report a problem" }).click();

  const dialog = page.getByRole("dialog", { name: "Report a problem with code-review" });
  const copy = dialog.getByRole("button", { name: "Copy report" });
  // Nothing to file until something is said about what happened.
  await expect(copy).toBeDisabled();
  await expect(dialog.getByText("Anyone who can see that repository's issues")).toBeVisible();

  await dialog.getByLabel("What happened").fill("It printed the diff before the summary.");
  await dialog.getByLabel("Proposed change to SKILL.md").fill("Print the summary first.");
  const preview = dialog.getByRole("region", { name: "What will be filed" });
  await expect(preview).toContainText("code-review: It printed the diff before the summary.");
  await expect(preview).toContainText("### Proposed change to SKILL.md");
  await expect(preview).toContainText("- Skill: `code-review`");
  await expect(preview).toContainText(/- Installed revision: `[0-9a-f]{7,}`/);
  // Nothing from this computer is in it.
  await expect(preview).not.toContainText("/.loadout/");

  // The preview repository is not on GitHub or GitLab, so there is no page to open.
  await expect(dialog.getByRole("button", { name: /^Open on/ })).toHaveCount(0);
  await copy.click();
  await expect(toasts(page).filter({ hasText: "Copied to clipboard" })).toBeVisible();
});

test("a skill made here has nowhere to report to", async ({ page }) => {
  await openApp(page, "/library");
  await main(page).getByRole("button", { name: "commit-messages", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "commit-messages" });
  await panel.getByRole("tab", { name: "Source" }).click();
  await expect(panel.getByText("Type", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Report a problem" })).toHaveCount(0);
});
