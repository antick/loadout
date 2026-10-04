import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { createBareRemote } from "./backup-world";
import { tempDir, createTestCore } from "./helpers";

/** Two full cores (devices) sharing one remote, with copy-mode deployments on the second. */
describe("deployed copies after a sync", () => {
  let temp: ReturnType<typeof tempDir>;
  let a: Core;
  let b: Core;

  const open = (name: string): Core => {
    const home = join(temp.dir, `home-${name}`);
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".cursor"), { recursive: true });
    return createTestCore({
      homeDir: home,
    });
  };

  beforeEach(() => {
    temp = tempDir();
    a = open("A");
    b = open("B");
  });
  afterEach(() => {
    a.close();
    b.close();
    temp.cleanup();
  });

  it("refreshes copies after a sync, but not one edited in the agent's folder", async () => {
    const remote = createBareRemote(temp.dir);
    const skill = await a.api.skills.create({ name: "alpha", description: "Test skill" });
    await a.api.backup.init();
    await a.api.backup.setRemote(remote);
    await a.api.backup.sync();

    await b.api.backup.clone(remote);
    b.ctx.settings.set("deployMode", "copy");
    await b.api.deploy.apply([skill.id], ["claude_code", "cursor"], "add");
    const copy = join(b.ctx.homeDir, ".claude", "skills", "alpha", "notes.md");
    writeFileSync(copy, "edited in the agent's folder\n");

    writeFileSync(join(skill.libraryPath, "notes.md"), "changed on device A\n");
    await a.background.libraryChangedOnDisk();
    await a.api.backup.sync();
    await b.api.backup.sync();

    expect(readFileSync(join(b.store.get(skill.id).libraryPath, "notes.md"), "utf8")).toBe(
      "changed on device A\n",
    );
    expect(readFileSync(copy, "utf8")).toBe("edited in the agent's folder\n");
    const untouched = join(b.ctx.homeDir, ".cursor", "skills", "alpha", "notes.md");
    expect(readFileSync(untouched, "utf8")).toBe("changed on device A\n");
    expect(await b.api.storage.removed()).toEqual([]);
  });
});
