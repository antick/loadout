import type { ProjectSuggestion } from "@loadout/shared";
import { expect, openApp, test } from "./app";

const LAYOUT_TIMEOUT_MS = 5_000;
const SCREENSHOTS = process.env.LOADOUT_SCREENSHOTS;
const VIEWPORTS = [
  { width: 1400, height: 900 },
  { width: 800, height: 600 },
  { width: 390, height: 700 },
];
const SUGGESTIONS: ProjectSuggestion[] = Array.from({ length: 8 }, (_, index) => ({
  name: `project-${index}`,
  path: `/home/developer/projects/${"long-folder-name/".repeat(8)}project-${index}`,
  sources: ["git", "cursor"],
  lastActiveAt: null,
  skillFolders: [
    ".claude/skills",
    ".agents/skills",
    ".hermes/skills",
    ".grok/skills",
    ".pi/skills",
  ],
  guarded: true,
}));

for (const viewport of VIEWPORTS) {
  test(`project dialog contains its content at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route("**/__loadout/invoke", (route) =>
      route.request().postDataJSON().channel === "projects.suggest"
        ? route.fulfill({ json: { ok: true, value: SUGGESTIONS } })
        : route.continue(),
    );
    await openApp(page, "/");
    await page.getByRole("button", { name: "Link a project" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Link a project" });
    for (const tab of ["Suggested", "Linked workspace", "Folder"]) {
      await dialog.getByRole("tab", { name: tab, exact: true }).click();
      if (tab === "Suggested")
        await expect(dialog.getByText("project-0", { exact: true })).toBeVisible();
      await expect(async () => {
        const bounds = await dialog.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            overflow: element.scrollWidth - element.clientWidth,
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          };
        });
        expect(bounds.overflow).toBeLessThanOrEqual(1);
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(viewport.width);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
      }).toPass({ timeout: LAYOUT_TIMEOUT_MS });
      if (SCREENSHOTS && tab === "Suggested") {
        await page.screenshot({ path: `${SCREENSHOTS}/project-dialog-${viewport.width}.png` });
      }
      await dialog.getByRole("button", { name: "Cancel", exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
