import { expect, main, openApp, setUp, test, toasts } from "./app";

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

test("a broken skills.toml says why instead of disappearing", async ({ page }) => {
  await setUp(page, "skills-file-broken");
  await openApp(page, "/projects");
  await main(page)
    .getByRole("link", { name: "Open project “shop-web”" })
    .click({ position: { x: 12, y: 12 } });
  const alert = main(page).getByRole("alert").filter({ hasText: "Cannot read it:" });
  await expect(alert).toContainText("skills.toml: not valid TOML");
  await expect(main(page).getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a picked folder lists the projects under it, or is linked as a new one", async ({ page }) => {
  await openApp(page, "/");
  await page.getByRole("button", { name: "Link a project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Link a project" });
  const folder = dialog.getByLabel("Project folder");

  // The folder picker answers with ~/code/new-project; its parent holds the seeded projects.
  await dialog.getByRole("button", { name: "Browse" }).click();
  await expect(folder).not.toHaveValue("");
  const picked = await folder.inputValue();
  const separator = picked.includes("\\") ? "\\" : "/";
  const code = picked.slice(0, picked.lastIndexOf(separator));
  await folder.fill(code);
  await dialog.getByRole("button", { name: "Link project" }).click();
  await expect(dialog.getByText("6 projects found")).toBeVisible();
  await expect(dialog.getByText("shop-web")).toBeVisible();

  // A folder with agent skills is linked straight away, here refused as it is linked already.
  await folder.fill(`${code}${separator}shop-web`);
  await dialog.getByRole("button", { name: "Link project" }).click();
  await expect(dialog.getByText(/already a workspace/)).toBeVisible();

  // An empty folder has nothing under it: it can still become a project of its own.
  await folder.fill(picked);
  await dialog.getByRole("button", { name: "Link project" }).click();
  await expect(dialog.getByText(/No project with agent skills was found/)).toBeVisible();
  await dialog.getByRole("button", { name: "Link this folder" }).click();
  await expect(toasts(page).getByText("Linked “new-project”")).toBeVisible();
});

test("updating the library from the selection asks which copy when they differ", async ({
  page,
}) => {
  await setUp(page, "project-copies-differ");
  await openApp(page, "/projects");
  await main(page)
    .getByRole("link", { name: "Open project “billing-api”" })
    .click({ position: { x: 12, y: 12 } });
  const content = main(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await content.getByRole("checkbox", { name: "Select code-review" }).check();
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Update library (1)" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Which copy of “code-review” goes to the library?" }),
  ).toBeVisible();
});

test("skills.toml dialogs keep their place: an option changed, or a failed look", async ({
  page,
}) => {
  await openApp(page, "/projects");
  await main(page)
    .getByRole("link", { name: "Open project “shop-web”" })
    .click({ position: { x: 12, y: 12 } });
  const content = main(page);

  // The suggestion fails: the dialog says so and can try again, instead of spinning for ever.
  await page.route("**/invoke", (route) =>
    route.request().postData()?.includes("skillsFile.suggest") ? route.abort() : route.continue(),
  );
  await content.getByRole("button", { name: "Create…" }).click();
  const create = page.getByRole("dialog");
  await expect(create.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.unroute("**/invoke");
  await create.getByRole("button", { name: "Retry" }).click();
  await create.getByRole("button", { name: "Create file" }).click();
  await expect(create).toHaveCount(0);

  // Ticking an option asks again, with the plan and the box still there meanwhile.
  await content.getByRole("button", { name: "Apply…" }).click();
  const plan = page.getByRole("dialog");
  const prune = plan.getByRole("checkbox", { name: /Also remove skills/ });
  await prune.check();
  await expect(prune).toBeChecked();
  await expect(prune).toBeFocused();
  await expect(plan.getByText(".cursor/skills/code-review")).toBeVisible();
});
