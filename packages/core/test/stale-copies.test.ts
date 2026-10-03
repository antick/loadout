import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Core } from "../src/core";
import { createStaleCopyRefresher } from "../src/deploy";
import type { StaleCopiesReport } from "../src/deploy";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { tempDir, writeFile, createTestCore } from "./helpers";

const emptyReport = (): StaleCopiesReport => ({ written: 0, conflicts: [], failed: [], kept: [] });

describe("refreshing stale copies", () => {
  let world: DeployWorld;
  const target = (agentDir: string, dirName: string): string =>
    join(world.home, agentDir, "skills", dirName);

  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".claude", ".codex");
  });
  afterEach(() => world.cleanup());

  it("re-copies only copies made from an older version of the library skill", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const changed = world.addSkill("alpha");
    const untouched = world.addSkill("beta");
    await world.deploy.api.apply([changed.id, untouched.id], ["claude_code"], "add");
    const marker = join(target(".claude", "beta"), "marker.txt");
    writeFile(marker, "still here means beta was not rewritten");

    // Edited outside the app: the rebuild re-hashes the library, the copy is now behind.
    writeFile(join(changed.libraryPath, "new.txt"), "fresh");
    const updated = world.rehash(changed);

    const report = await world.deploy.refreshStaleCopies();
    expect(report).toEqual({ written: 1, conflicts: [], failed: [], kept: [] });
    expect(readFileSync(join(target(".claude", "alpha"), "new.txt"), "utf8")).toBe("fresh");
    expect(world.store.deployment(changed.id, "claude_code")?.sourceHash).toBe(updated.contentHash);
    expect(existsSync(marker)).toBe(true);

    expect(await world.deploy.refreshStaleCopies()).toEqual(emptyReport());
  });

  it("keeps a copy edited in the agent's folder and names it", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("alpha");
    await world.deploy.api.apply([skill.id], ["claude_code", "codex"], "add");
    const edited = join(target(".claude", "alpha"), "SKILL.md");
    writeFile(edited, "---\nname: alpha\ndescription: my own words\n---\n");

    writeFile(join(skill.libraryPath, "new.txt"), "fresh");
    world.rehash(skill);

    const report = await world.deploy.refreshStaleCopies();
    expect(report.written).toBe(1);
    expect(report.kept).toEqual([{ skill: "alpha", agent: "Claude Code" }]);
    expect(readFileSync(edited, "utf8")).toContain("my own words");
    expect(existsSync(join(target(".claude", "alpha"), "new.txt"))).toBe(false);
    expect(readFileSync(join(target(".codex", "alpha"), "new.txt"), "utf8")).toBe("fresh");
  });

  it("leaves links alone: they already show the library", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    writeFile(join(skill.libraryPath, "new.txt"), "fresh");
    world.rehash(skill);
    expect(await world.deploy.refreshStaleCopies()).toEqual(emptyReport());
  });
});

describe("stale copy refresher", () => {
  it("runs one pass at a time and folds a burst of requests into one more pass", async () => {
    const world = createDeployWorld();
    const gates: (() => void)[] = [];
    const release = (): void => gates.shift()?.();
    const refreshStaleCopies = vi.fn(
      () =>
        new Promise<StaleCopiesReport>((resolve) => {
          gates.push(() => resolve(emptyReport()));
        }),
    );
    try {
      const refresher = createStaleCopyRefresher(world.ctx, { refreshStaleCopies });
      refresher.request();
      refresher.request();
      refresher.request();
      expect(refreshStaleCopies).toHaveBeenCalledTimes(1);
      release();
      await vi.waitFor(() => expect(refreshStaleCopies).toHaveBeenCalledTimes(2));
      release();
      await refresher.idle();
      expect(refreshStaleCopies).toHaveBeenCalledTimes(2);
    } finally {
      world.cleanup();
    }
  });

  it("survives a failing pass", async () => {
    const world = createDeployWorld();
    const refreshStaleCopies = vi
      .fn<() => Promise<StaleCopiesReport>>()
      .mockRejectedValueOnce(new Error("disk gone"))
      .mockResolvedValue(emptyReport());
    try {
      const refresher = createStaleCopyRefresher(world.ctx, { refreshStaleCopies });
      refresher.request();
      await refresher.idle();
      refresher.request();
      await refresher.idle();
      expect(refreshStaleCopies).toHaveBeenCalledTimes(2);
    } finally {
      world.cleanup();
    }
  });
});

describe("outside library edits in the running app", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    mkdirSync(join(temp.dir, ".claude"), { recursive: true });
    core = createTestCore({
      homeDir: temp.dir,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("refresh the copies an agent was given", async () => {
    await core.api.settings.set("deployMode", "copy");
    const skill = await core.api.skills.create({
      name: "alpha",
      description: "A skill edited outside the app",
    });
    await core.api.deploy.deploy(skill.id, "claude_code");
    const copied = join(temp.dir, ".claude", "skills", "alpha", "notes.md");
    expect(existsSync(copied)).toBe(false);

    writeFile(join(skill.libraryPath, "notes.md"), "written in another editor");
    core.background.libraryChangedOnDisk();

    await vi.waitFor(() => expect(readFileSync(copied, "utf8")).toBe("written in another editor"));
  });
});
