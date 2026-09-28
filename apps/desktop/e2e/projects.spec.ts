import { expect, main, openApp, test, toasts } from "./app";

test("create a project's skills.toml, look at the plan, and apply it", async ({ page }) => {
  // shop-web in the preview data.
  await openApp(page, "/projects/pr-shop");
  const content = main(page);
  await expect(content.getByText(/Share this project's skills/)).toBeVisible();

  await content.getByRole("button", { name: "Create…" }).click();
  const create = page.getByRole("dialog");
  await expect(create.getByText("https://github.com/acme/skills")).toBeVisible();
  await create.getByRole("button", { name: "Create file" }).click();
  await expect(content.getByText("1 source · not applied yet")).toBeVisible();

  await content.getByRole("button", { name: "Apply…" }).click();
  const plan = page.getByRole("dialog");
  await expect(plan.getByText(".claude/skills/code-review")).toBeVisible();
  await plan.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(toasts(page).getByText("Applied skills.toml: 2 folders written")).toBeVisible();
  await expect(content.getByText("1 source · 2 folders applied")).toBeVisible();
});
