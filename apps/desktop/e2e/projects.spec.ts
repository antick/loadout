import { expect, main, openApp, test, toasts } from "./app";

test("create a project's skills.toml, look at the plan, and apply it", async ({ page }) => {
  // shop-web has code-review for Claude Code and sql-migrations for Cursor, copied in by hand
  // from the seed's skills repository.
  await openApp(page, "/projects");
  // The card's corner: its middle holds the folder path and its own button.
  const card = main(page).getByRole("link", { name: "Open project “shop-web”" });
  await card.click({ position: { x: 12, y: 12 } });
  const content = main(page);
  await expect(content.getByText(/Share this project's skills/)).toBeVisible();

  await content.getByRole("button", { name: "Create…" }).click();
  const create = page.getByRole("dialog");
  await expect(create.getByText("https://example.com/acme/skills")).toBeVisible();
  await create.getByRole("button", { name: "Create file" }).click();
  await expect(content.getByText("1 source · not applied yet")).toBeVisible();

  // Each skill goes to both agents' folders; the copy edited since is left as it is.
  await content.getByRole("button", { name: "Apply…" }).click();
  const plan = page.getByRole("dialog");
  await expect(plan.getByText(".cursor/skills/code-review")).toBeVisible();
  await plan.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(toasts(page).getByText("Applied skills.toml: 2 folders written")).toBeVisible();
  // The two written and the one already the same; the edited copy stays out of the lock.
  await expect(content.getByText("1 source · 3 folders applied")).toBeVisible();
});
