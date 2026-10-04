import { expect, main, openApp, test } from "./app";

test("⌘P finds a skill like the library does: by its description, words in any order", async ({
  page,
}) => {
  await openApp(page, "/library");
  await page.keyboard.press("ControlOrMeta+P");
  const picker = page.getByRole("dialog");
  await picker.getByRole("combobox").fill("readable pull");
  await expect(picker.getByRole("option", { name: /release-notes/ })).toBeVisible();
  await expect(picker.getByRole("option")).toHaveCount(1);
});

test("⌘K finds a skill by its description too", async ({ page }) => {
  await openApp(page, "/library");
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox").fill("readable pull");
  await expect(palette.getByRole("option", { name: /release-notes/ })).toBeVisible();
});

test("an agent's page finds a skill by the starts of its name's parts", async ({ page }) => {
  await openApp(page, "/agents/claude_code");
  const content = main(page);
  await expect(content.getByRole("heading", { name: "api-docs", level: 3 })).toBeVisible();
  await content.getByPlaceholder("Search this folder").fill("tf");
  // The search waits for typing to stop: first the other skills go, then what is left counts.
  await expect(content.getByRole("heading", { name: "api-docs", level: 3 })).toHaveCount(0);
  await expect(content.getByRole("heading", { level: 3 })).toHaveText(["test-first"]);
});
