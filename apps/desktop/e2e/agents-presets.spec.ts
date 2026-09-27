import { expect, main, openApp, test, toasts } from "./app";

test("apply a preset and get a reload hint", async ({ page }) => {
  await openApp(page, "/presets");
  await main(page).getByRole("link", { name: "Open preset “Frontend work”" }).click();
  await expect(page.getByRole("heading", { name: "Frontend work", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Apply preset" }).click();
  const toast = toasts(page).first();
  await expect(toast).toContainText("Added 7 deployments");
  // OpenCode needs a restart; Cursor and Desk Helper have no documented behaviour in the seed.
  await expect(toast).toContainText("Restart OpenCode to see the change.");
  await expect(toast).toContainText(
    "If Cursor and Desk Helper do not show the change, start a new session or restart them.",
  );
});

test("an agent's page says when it sees skill changes", async ({ page }) => {
  await openApp(page, "/agents/claude_code");
  await expect(
    main(page).getByText(
      "Claude Code picks up new, changed and removed skills while it runs. If one does not show up, type /reload-skills.",
    ),
  ).toBeVisible();
});

test("an undocumented agent's page says so instead of guessing", async ({ page }) => {
  await openApp(page, "/agents/desk_helper");
  await expect(
    main(page).getByText(
      "Its documentation does not say when Desk Helper sees skill changes. If one does not show up, start a new session or restart it.",
    ),
  ).toBeVisible();
});
