import { expect, main, openApp, test } from "./app";

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

test("search the Marketplace and load more results", async ({ page }) => {
  await openApp(page, "/install");
  const panel = main(page).getByRole("tabpanel", { name: "Marketplace" });
  await panel.getByRole("searchbox", { name: "Search skills.sh" }).fill("skills");

  // The preview catalogue has 43 matches: the first search asks for 40, "Load more" for the rest.
  const count = panel.getByText(/^\d+ results?$/);
  await expect(count).toHaveText("40 results");
  await expect(panel.getByRole("article")).toHaveCount(40);
  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(count).toHaveText("43 results");
  await expect(panel.getByRole("article")).toHaveCount(43);
  await expect(panel.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("the Backup page lists what is held back and backs it up anyway", async ({ page }) => {
  await openApp(page, "/backup");
  const content = main(page);
  await expect(page.getByRole("heading", { name: "Backup", level: 1 })).toBeVisible();
  await expect(content.getByRole("button", { name: "Sync now" })).toBeVisible();
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
