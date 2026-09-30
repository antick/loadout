import { expect, openApp, test, toasts } from "./app";

test("a tag chip in the picker shows the agent's coverage and ticks what it is missing", async ({
  page,
}) => {
  await openApp(page, "/agents/claude_code");
  await page.getByRole("button", { name: "Add skills" }).click();
  const picker = page.getByRole("dialog", { name: "Add skills to Claude Code" });
  const tags = picker.getByRole("group", { name: "Filter by tag" });
  // Claude Code has code-review but not sql-migrations: one of the two "quality" skills.
  await expect(tags.getByRole("button", { name: "quality 1/2" })).toBeVisible();
  await expect(tags.getByRole("button", { name: "review 2/2" })).toBeVisible();

  await tags.getByRole("button", { name: "quality 1/2" }).click();
  await expect(picker.getByRole("checkbox", { name: "Select sql-migrations" })).toBeChecked();
  await picker.getByRole("button", { name: "Add 1 skill" }).click();
  await expect(toasts(page).filter({ hasText: "Added 1 skill" })).toBeVisible();
});
