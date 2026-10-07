import type { Page } from "@playwright/test";
import { expect, main, openApp, test, toasts } from "./app";

const SKILL = "react-patterns";
const AGENT = { key: "claude_code", name: "Claude Code" };
const EDIT = "My own note, made in the agent's folder.";

/** Copy the skill to the agent and edit the copy there, as someone working in that agent would. */
async function editedCopy(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    await window.loadout.invoke("settings.set", ["deployMode", "copy"]);
    const { value: skills } = await window.loadout.invoke("skills.list", []);
    const skill = skills.find((entry) => entry.name === ${JSON.stringify(SKILL)});
    await window.loadout.invoke("deploy.deploy", [skill.id, ${JSON.stringify(AGENT.key)}]);
    const copy = { kind: "agent", agentKey: ${JSON.stringify(AGENT.key)}, relativePath: skill.dirName };
    const { value: file } = await window.loadout.invoke("editor.readFile", [copy, "SKILL.md"]);
    await window.loadout.invoke("editor.saveFile", [
      copy,
      { path: "SKILL.md", content: file.content + ${JSON.stringify(`\n${EDIT}\n`)}, baseHash: file.hash },
    ]);
  })()`);
}

/** The copy's text in the agent's folder, or null when it is not there. */
async function copyText(page: Page): Promise<string | null> {
  return page.evaluate(`(async () => {
    const copy = { kind: "agent", agentKey: ${JSON.stringify(AGENT.key)}, relativePath: ${JSON.stringify(SKILL)} };
    const answer = await window.loadout.invoke("editor.readFile", [copy, "SKILL.md"]);
    return answer.ok ? answer.value.content : null;
  })()`);
}

test("removing an edited copy from the Agents tab asks first and can be undone", async ({
  page,
}) => {
  await openApp(page, "/library");
  await editedCopy(page);
  await main(page).getByRole("button", { name: SKILL, exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("tab", { name: /Agents/ }).click();
  const row = panel.getByRole("listitem").filter({ hasText: AGENT.name });

  await row.getByRole("switch").click();
  const ask = page.getByRole("alertdialog", { name: `Remove “${SKILL}” from ${AGENT.name}?` });
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(row.getByRole("switch")).toBeChecked();
  expect(await copyText(page)).toContain(EDIT);

  await row.getByRole("switch").click();
  await ask.getByRole("button", { name: "Remove" }).click();
  const toast = toasts(page).filter({ hasText: "Removed the copy you edited" });
  await expect(toast).toBeVisible();
  await expect(row.getByRole("switch")).not.toBeChecked();
  expect(await copyText(page)).toBeNull();

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toasts(page).filter({ hasText: "Put the folder back" })).toBeVisible();
  expect(await copyText(page)).toContain(EDIT);
});

test("removing an edited copy from the agent's page says so once, with Undo", async ({ page }) => {
  await openApp(page, "/library");
  await editedCopy(page);
  await openApp(page, `/agents/${AGENT.key}`);
  await main(page)
    .getByRole("button", { name: `Actions for ${SKILL}` })
    .click();
  await page.getByRole("menuitem", { name: `Remove from ${AGENT.name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();

  const kept = toasts(page).filter({ hasText: "Removed the copy you edited" });
  await expect(kept.getByRole("button", { name: "Undo" })).toBeVisible();
  // Both would come from the same finished removal: once the first is in, so is any second.
  await expect(toasts(page)).toHaveCount(1);
});
