import { activityBar, expect, main, openApp, test } from "./app";

// Sidebar label of each section in `features/settings/constants.ts`, in the same order.
const SETTINGS_SECTIONS = [
  "Agents",
  "General",
  "Storage",
  "Network",
  "Skill updates",
  "Marketplaces",
  "Safety",
  "Agent control",
  "About",
];

test("every Settings section renders without an error", async ({ page }) => {
  await openApp(page, "/settings");
  const content = main(page);
  await activityBar(page).getByRole("button", { name: "Settings" }).click();
  const sidebar = page.getByLabel("Settings sidebar");
  for (const name of SETTINGS_SECTIONS) {
    await sidebar.getByRole("link", { name }).click();
    await expect(content.getByRole("heading", { name, level: 2 })).toBeVisible();
    // The router's error boundary, and the failed-load state a section shows instead of data.
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(content.getByText("Could not load this")).toHaveCount(0);
  }
});

test("the command palette opens with the shortcut and jumps to a skill", async ({ page }) => {
  await openApp(page, "/");
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();

  await palette.getByRole("combobox").fill("test-first");
  await palette.getByRole("option", { name: "test-first" }).click();
  await expect(palette).toHaveCount(0);

  // The address names the skill by its id.
  await expect(page).toHaveURL(/#\/library\?skill=[\w-]+$/);
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("heading", { name: "test-first", level: 2 })).toBeVisible();
});
