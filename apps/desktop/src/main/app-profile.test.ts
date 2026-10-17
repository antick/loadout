import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCore } from "@loadout/core";
import { afterEach, expect, it } from "vitest";
import { appProfile } from "./app-profile";

const homes: string[] = [];
afterEach(() => homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true })));

it("keeps installed data in place and puts all development state in a separate home", async () => {
  const home = mkdtempSync(join(tmpdir(), "loadout-profile-"));
  homes.push(home);
  const production = appProfile(true, home);
  const development = appProfile(false, home);
  expect(production.appDataDir).toBe(join(home, ".loadout", "app"));
  expect(development.homeDir).toBe(join(home, ".loadout-dev"));
  expect(development.name).not.toBe(production.name);
  expect(development.id).not.toBe(production.id);

  const installed = createCore({ homeDir: production.homeDir, env: () => ({}) });
  const dev = createCore({ homeDir: development.homeDir, env: () => ({}) });
  try {
    installed.ctx.settings.set("showTrayIcon", false);
    dev.ctx.settings.set("showTrayIcon", true);
    expect(installed.ctx.settings.get("showTrayIcon")).toBe(false);
    expect(dev.ctx.paths.dbPath).not.toBe(installed.ctx.paths.dbPath);
    expect(dev.ctx.paths.binDir).not.toBe(installed.ctx.paths.binDir);
    expect(dev.ctx.paths.configPath).not.toBe(installed.ctx.paths.configPath);
    for (const agent of await dev.api.agents.list()) {
      expect(agent.skillsDir.startsWith(development.homeDir)).toBe(true);
    }
    const plan = await dev.storage.prepareRemoval({ removeCopies: false, keepLinkedSkills: false });
    expect(plan.paths.every((path) => path.startsWith(development.homeDir))).toBe(true);
    expect(plan.paths).not.toContain(installed.ctx.paths.defaultBaseDir);
  } finally {
    dev.close();
    installed.close();
  }
});
