import type { Page, Route } from "@playwright/test";
import { expect, openApp, test } from "./app";

/** Writes two of the seed's presets to files in the session's home; returns their paths. */
async function exportPresets(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(async () => {
    const { value: info } = await window.loadout.invoke("app.info", []);
    const { value: presets } = await window.loadout.invoke("presets.list", []);
    const paths = [];
    for (const name of ["Frontend work", "Backend work"]) {
      const preset = presets.find((item) => item.name === name);
      const dest = info.homeDir + "/" + name.replace(" ", "-") + ".loadout-preset.json";
      const { value } = await window.loadout.invoke("presets.exportFile", [preset.id, dest]);
      paths.push(value.path);
    }
    return paths;
  })()`);
}

test("a look still under way when the input changes never decides what is imported", async ({
  page,
}) => {
  await openApp(page, "/presets");
  const [frontend = "", backend = ""] = await exportPresets(page);

  // Hold the answer for the first file until the input has moved on.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/__loadout/invoke", async (route: Route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("presets.previewImport") && body.includes(frontend)) await held;
    await route.continue();
  });

  // In the title bar, outside the page's main content.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import a preset" });
  const input = dialog.getByLabel("File or link");
  await input.fill(frontend);
  await dialog.getByRole("button", { name: "Look inside" }).click();
  await input.fill(backend);

  const answered = page.waitForResponse((response) =>
    (response.request().postData() ?? "").includes(frontend),
  );
  release();
  await answered;
  // Two frames: whatever the late answer would show has been drawn by now.
  await page.evaluate(
    "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))",
  );
  await expect(dialog.getByLabel("Preset name")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Look inside" }).click();
  await expect(dialog.getByLabel("Preset name")).toHaveValue("Backend work");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Backend work");
});
