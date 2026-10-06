import type { Page } from "@playwright/test";
import { expect, main, openApp, test } from "./app";

/** Paths of the editor drafts kept in localStorage. */
async function storedDrafts(page: Page): Promise<string[]> {
  const keys = await page.evaluate<string[]>("Object.keys(localStorage)");
  return keys
    .filter((key) => key.includes("editor.draft:"))
    .map((key) => key.slice(key.lastIndexOf(":") + 1))
    .sort();
}

/** From code-review's panel, which Done also goes back to. */
async function openEditor(page: Page): Promise<void> {
  const panel = page.getByRole("dialog", { name: "code-review" });
  await panel.getByRole("link", { name: "Edit", exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Contents of SKILL.md" })).toBeVisible();
}

test("save and leave keeps no drafts of the saved files", async ({ page }) => {
  await openApp(page, "/library");
  await main(page).getByRole("button", { name: "code-review", exact: true }).click();
  await openEditor(page);
  const files = page.getByRole("navigation", { name: "Files of the skill" });

  const skill = page.getByRole("textbox", { name: "Contents of SKILL.md" });
  await skill.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nOne more line.");
  await files.getByRole("button", { name: /examples\.md/ }).click();
  const examples = page.getByRole("textbox", { name: "Contents of examples.md" });
  await examples.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nAnother example.");
  // Both edits have been mirrored to storage, as they would be after a pause in typing.
  await expect.poll(() => storedDrafts(page)).toEqual(["SKILL.md", "examples.md"]);

  await page.getByRole("button", { name: "Done", exact: true }).click();
  const leave = page.getByRole("alertdialog", { name: "Save changes to 2 files?" });
  await leave.getByRole("button", { name: "Save and leave" }).click();
  await expect(leave).toBeHidden();
  // Back on the skill's panel: the editor is gone, and so is every draft it kept.
  await expect(page.getByRole("dialog", { name: "code-review" })).toBeVisible();
  await expect(examples).toBeHidden();
  expect(await storedDrafts(page)).toEqual([]);

  // Reopened: nothing is marked unsaved, and the saved text is what shows.
  await openEditor(page);
  await expect(files.getByText("Unsaved changes")).toHaveCount(0);
  await expect(page.getByText("Unsaved changes from last time are back")).toHaveCount(0);
  await files.getByRole("button", { name: /examples\.md/ }).click();
  await expect(page.getByRole("textbox", { name: "Contents of examples.md" })).toContainText(
    "Another example.",
  );
});

test("discarding unsaved drafts in Settings asks first, saying how many", async ({ page }) => {
  await openApp(page, "/settings?section=storage");
  await page.evaluate(() => {
    for (const path of ["SKILL.md", "notes.md"]) {
      // A real draft: the app drops unreadable or expired ones when it starts.
      const draft = { baseHash: "h", content: "unsaved", savedAt: Date.now() };
      localStorage.setItem(`loadout:editor.draft:skill-1:${path}`, JSON.stringify(draft));
    }
  });
  // Web storage is read when the section mounts.
  await page.reload();
  const discard = main(page).getByRole("button", { name: "Discard" });
  await discard.click();
  const ask = page.getByRole("alertdialog", { name: "Discard 2 unsaved drafts?" });
  await ask.getByRole("button", { name: "Cancel" }).click();
  expect(await storedDrafts(page)).toEqual(["SKILL.md", "notes.md"]);

  await discard.click();
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
});
