import type { Page } from "@playwright/test";
import { expect, main, openApp, test } from "./app";

/** Whether Claude Code's global instruction file exists, asked of the core as the CLI would. */
async function claudeFileExists(page: Page): Promise<boolean> {
  return page.evaluate(`(async () => {
    const { value: files } = await window.loadout.invoke("instructions.list", [null]);
    return files.find((file) => file.name === "CLAUDE.md").exists;
  })()`);
}

test("a missing instruction file opens empty and is written only when saved", async ({ page }) => {
  await openApp(page, "/agents/claude_code");
  await main(page).getByRole("button", { name: "CLAUDE.md", exact: true }).click();

  const content = main(page);
  await expect(
    content.getByText("CLAUDE.md does not exist yet. It is created when you save."),
  ).toBeVisible();
  // Opening it wrote nothing.
  expect(await claudeFileExists(page)).toBe(false);

  await page.locator(".cm-content").click();
  await page.keyboard.type("Keep answers short.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(content.getByText("CLAUDE.md does not exist yet.", { exact: false })).toHaveCount(0);
  expect(await claudeFileExists(page)).toBe(true);
});
