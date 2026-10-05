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

test("a preset pill on an agent page counts only what the preset would deploy there", async ({
  page,
}) => {
  // Frontend work holds react-patterns, which Claude Code lacks; its switch goes off there.
  await openApp(page, "/presets");
  await main(page).getByRole("link", { name: "Open preset “Frontend work”" }).click();
  const row = main(page)
    .getByRole("link", { name: "react-patterns", exact: true })
    .locator("xpath=ancestor::div[@data-state][1]");
  await row.getByRole("button", { name: "Agents" }).click();
  const toggle = row.getByRole("switch", { name: "Include Claude Code when applying" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await openApp(page, "/agents/claude_code");
  const pill = main(page)
    .getByRole("group", { name: "Presets" })
    .getByRole("button", { name: /Frontend work/ });
  await expect(pill).toHaveAttribute("aria-pressed", "true");

  // Fully there, so a click takes the preset off this agent.
  await pill.click();
  await expect(toasts(page).first()).toContainText("Removed 2 deployments");
  await expect(pill).toHaveAttribute("aria-pressed", "false");
});

test("dragging a preset's skill reorders it", async ({ page }) => {
  await openApp(page, "/presets");
  await main(page).getByRole("link", { name: "Open preset “Frontend work”" }).click();
  const names = main(page).getByRole("link", {
    name: /^(react-patterns|code-review|test-first)$/,
  });
  await expect(names).toHaveText(["react-patterns", "code-review", "test-first"]);

  const first = await names.nth(0).boundingBox();
  const second = await names.nth(1).boundingBox();
  if (!first || !second) throw new Error("The rows are not on screen");
  // Grab the row beside its name (the whole row is the handle), then pull it below the second.
  const x = first.x + first.width + 40;
  await page.mouse.move(x, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + 200, first.y + first.height / 2 + 10, { steps: 5 });
  await page.mouse.move(x + 200, second.y + second.height + 10, { steps: 10 });
  await page.mouse.up();
  await expect(names).toHaveText(["code-review", "react-patterns", "test-first"]);
});
