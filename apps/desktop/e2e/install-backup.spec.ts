import { expect, main, openApp, test } from "./app";

/** The seed's skills repository: code-review and sql-migrations came from it. */
const SOURCE = "https://example.com/acme/skills";
const INSTALL_TABS = ["Marketplace", "This computer", "Git or link", "Agent folders"];

test("every Install tab opens", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  for (const name of INSTALL_TABS) {
    await content.getByRole("tab", { name }).click();
    await expect(content.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    await expect(content.getByRole("tabpanel", { name })).toBeVisible();
    await expect(content.getByRole("alert")).toHaveCount(0);
  }
});

test("a board shows its first skills and the rest on request", async ({ page }) => {
  await openApp(page, "/install");
  const panel = main(page).getByRole("tabpanel", { name: "Marketplace" });
  // The preview board holds 30 skills; 24 show at first.
  await expect(panel.getByRole("article")).toHaveCount(24);
  await expect(panel.getByText("30 results")).toBeVisible();
  await panel.getByRole("button", { name: "Show more" }).click();
  await expect(panel.getByRole("article")).toHaveCount(30);
  await expect(panel.getByRole("button", { name: "Show more" })).toHaveCount(0);
});

test("search the Marketplace and show more results", async ({ page }) => {
  await openApp(page, "/install");
  const panel = main(page).getByRole("tabpanel", { name: "Marketplace" });
  await panel.getByRole("searchbox", { name: "Search skills.sh" }).fill("skills");

  // The preview catalogue has 43 matches: the first search asks for 40, "Show more" for the rest.
  const count = panel.getByText(/^\d+ results?$/);
  await expect(count).toHaveText("40 results");
  await expect(panel.getByRole("article")).toHaveCount(40);
  await panel.getByRole("button", { name: "Show more" }).click();
  await expect(count).toHaveText("43 results");
  await expect(panel.getByRole("article")).toHaveCount(43);
  await expect(panel.getByRole("button", { name: "Show more" })).toHaveCount(0);
});

test("the import list says what each name will do and ticks a whole folder", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  await content.getByRole("tab", { name: "Git or link" }).click();
  await content.getByLabel("Repository, site or link").fill(SOURCE);
  await content.getByRole("button", { name: "Preview" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "6 skills found" })).toBeVisible();
  // code-review and sql-migrations came from this source before; release-notes is another skill.
  await expect(dialog.getByText(/Already imported from this source/)).toHaveCount(2);
  await expect(dialog.getByText(/release-notes is taken by a skill/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Import selected (3)" })).toBeVisible();

  // Ticking the folder takes its skill; renaming it frees the name.
  await dialog.getByRole("checkbox", { name: "Select every skill in skills/docs" }).click();
  await dialog.getByLabel("Library name for release-notes").fill("acme-release-notes");
  await expect(dialog.getByText(/release-notes is taken by a skill/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Import selected (4)" })).toBeVisible();
});

test("a name in use can replace the library skill instead", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  await content.getByRole("tab", { name: "Git or link" }).click();
  await content.getByLabel("Repository, site or link").fill(SOURCE);
  await content.getByRole("button", { name: "Preview" }).click();

  const dialog = page.getByRole("dialog");
  const replace = dialog.getByRole("checkbox", { name: "Replace release-notes in the library" });
  // Offered only once the row is ticked.
  await expect(replace).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: "Select release-notes" }).click();
  await replace.click();
  await expect(dialog.getByText(/Takes the place of release-notes in the library/)).toBeVisible();
  await expect(dialog.getByText(/release-notes is taken by a skill/)).toHaveCount(0);

  await replace.click();
  await expect(dialog.getByText(/release-notes is taken by a skill/)).toBeVisible();
});

test("closing the import list keeps the address; importing clears it", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  await content.getByRole("tab", { name: "Git or link" }).click();
  const field = content.getByLabel("Repository, site or link");
  await field.fill(SOURCE);
  await content.getByRole("button", { name: "Preview" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "6 skills found" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(field).toHaveValue(SOURCE);

  await content.getByRole("button", { name: "Preview" }).click();
  await dialog.getByRole("button", { name: /Import selected/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(field).toHaveValue("");
});

test("the Backup page lists what is held back and backs it up anyway", async ({ page }) => {
  await openApp(page, "/backup");
  const content = main(page);
  await expect(page.getByRole("heading", { name: "Backup", level: 1 })).toBeVisible();
  // api-docs gained a file after the last backup, with a token pasted into it.
  await expect(content.getByRole("button", { name: "Back up now" })).toBeVisible();
  await expect(content.getByRole("heading", { name: "History" })).toBeVisible();

  const heldBack = content.getByRole("heading", { name: "Held back from the backup" });
  await expect(heldBack).toBeVisible();
  await expect(content.getByText("GitHub token")).toBeVisible();
  await expect(content.getByText("api-docs/reference.md:14", { exact: false })).toBeVisible();

  await content.getByRole("button", { name: "Back up anyway" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("heading", { name: "Back up this possible key anyway?" }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Back up anyway" }).click();
  await expect(heldBack).toHaveCount(0);
});

test("leaving the page with the import list open throws its checkout away", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  await content.getByRole("tab", { name: "Git or link" }).click();
  await content.getByLabel("Repository, site or link").fill(SOURCE);
  await content.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "6 skills found" }),
  ).toBeVisible();

  const cancelled = page.waitForRequest((request) =>
    (request.postData() ?? "").includes("install.cancelPreview"),
  );
  // As a keyboard shortcut or the tray would: straight to another page, the list still open.
  await page.evaluate(() => {
    window.location.hash = "#/library";
  });
  await cancelled;
});
