import { expect, main, openApp, test } from "./app";

/** The seed's skills repository. */
const SOURCE = "https://example.com/acme/skills";

test("a skill that ships code says so in the library, its filter and its panel", async ({
  page,
}) => {
  await openApp(page, "/library");
  const content = main(page);
  await expect(content.getByLabel("Runs code")).toHaveCount(1);

  await content.getByRole("combobox", { name: "Filter by status" }).click();
  await page.getByRole("option", { name: "Runs code" }).click();
  await expect(content.getByRole("heading", { level: 3 })).toHaveText(["sql-migrations"]);

  await content.getByRole("button", { name: "sql-migrations", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("What it can do")).toBeVisible();
  await expect(panel.getByText(/Ships 2 files that can run: scripts\/apply.sh/)).toBeVisible();
  await expect(panel.getByText(/use tools without asking: Bash\(psql \*\), Read/)).toBeVisible();
});

test("the import list flags a skill that runs code before it is installed", async ({ page }) => {
  await openApp(page, "/install");
  const content = main(page);
  await content.getByRole("tab", { name: "Git or link" }).click();
  await content.getByLabel("Repository, site or link").fill(SOURCE);
  await content.getByRole("button", { name: "Preview" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "6 skills found" })).toBeVisible();
  await expect(dialog.getByText("Runs code")).toHaveCount(1);
});
