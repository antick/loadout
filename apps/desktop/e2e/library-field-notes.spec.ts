import { expect, main, openApp, test } from "./app";

test("the Agents tab says which agents do not act on a skill's frontmatter", async ({ page }) => {
  await openApp(page, "/library");
  await main(page).getByRole("button", { name: "sql-migrations", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("tab", { name: /Agents/ }).click();

  const rows = panel.getByRole("listitem");
  const openCode = rows.filter({ hasText: "OpenCode" });
  await expect(openCode.getByText("Skips allowed-tools, model")).toBeVisible();
  const cursor = rows.filter({ hasText: "Cursor" });
  await expect(cursor.getByText("Docs do not list allowed-tools, model")).toBeVisible();
  // Claude Code reads both, and Codex has no documentation Loadout can quote.
  await expect(
    rows.filter({ hasText: "Claude Code" }).getByText(/Skips|Docs do not list/),
  ).toHaveCount(0);
  await expect(rows.filter({ hasText: "Codex" }).getByText(/Skips|Docs do not list/)).toHaveCount(
    0,
  );

  await openCode.getByText("Skips allowed-tools, model").hover();
  await expect(page.getByRole("tooltip")).toContainText("documentation lists the fields it reads");
});
