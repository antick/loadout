import { expect, main, openApp, test } from "./app";

test("Claude Code shows what its skill listing costs, and the window changes the budget", async ({
  page,
}) => {
  await openApp(page, "/agents/claude_code");
  const content = main(page);
  await expect(content.getByText("About 741 of 8,000 characters")).toBeVisible();

  await content.getByRole("button", { name: "Details" }).click();
  await expect(
    content.getByText("It fits. Claude Code shows every listed description in full."),
  ).toBeVisible();
  await expect(
    content.getByText("10 with a description · 0 by name only · 0 hidden from the model"),
  ).toBeVisible();

  await content.getByRole("combobox", { name: "Context window" }).click();
  await page.getByRole("option", { name: "1M tokens" }).click();
  await expect(content.getByText("About 741 of 40,000 characters")).toBeVisible();
  // The card stays put while the new estimate is read.
  await expect(content.getByRole("button", { name: "Hide details" })).toBeVisible();

  await content.getByRole("button", { name: "Show all 10 listed skills" }).click();
  await expect(content.getByRole("button", { name: "Show fewer" })).toBeVisible();
});

test("other agents have no skill listing card", async ({ page }) => {
  await openApp(page, "/agents/codex");
  // Wait for the agent's own page first, so an empty result cannot mean it never loaded.
  await expect(main(page).getByText("Codex picks up", { exact: false })).toBeVisible();
  await expect(main(page).getByText("Skill listing", { exact: true })).toHaveCount(0);
});
