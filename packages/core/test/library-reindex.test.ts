import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { RepoLock } from "../src/lock";
import { tempDir, createTestCore } from "./helpers";

/**
 * Another process (a CLI sync, the app mid-merge) can set a skill folder aside for a moment while
 * it holds the library lock. Re-indexing must not read that moment as the skill being gone.
 */
describe("re-indexing the library while another process works in it", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let skillId: string;
  let skillDir: string;
  let aside: string;

  const open = (): Core =>
    createTestCore({
      homeDir: temp.dir,
    });

  beforeEach(async () => {
    temp = tempDir();
    mkdirSync(join(temp.dir, ".claude"), { recursive: true });
    core = open();
    const skill = await core.api.skills.create({ name: "alpha", description: "Test skill" });
    await core.api.deploy.apply([skill.id], ["claude_code"], "add");
    skillId = skill.id;
    skillDir = skill.libraryPath;
    aside = join(temp.dir, "alpha-aside");
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("waits for the other process before re-indexing after an outside change", async () => {
    const other = new RepoLock(core.ctx.paths.lockPath);
    let reindexed: Promise<void> = Promise.resolve();
    await other.run("merge in another process", async () => {
      renameSync(skillDir, aside);
      reindexed = core.background.libraryChangedOnDisk();
      await sleep(150);
      expect(core.store.find(skillId)).not.toBeNull();
      renameSync(aside, skillDir);
    });
    await reindexed;
    const skill = core.store.find(skillId);
    expect(skill).not.toBeNull();
    expect(skill?.deployments.map((d) => d.agentKey)).toEqual(["claude_code"]);
  });

  it("leaves the index alone on start while another process holds the library", async () => {
    const other = new RepoLock(core.ctx.paths.lockPath);
    core.close();
    await other.run("merge in another process", () => {
      renameSync(skillDir, aside);
      core = open();
      expect(core.store.find(skillId)).not.toBeNull();
      renameSync(aside, skillDir);
    });
    expect(core.store.find(skillId)?.deployments).toHaveLength(1);
  });
});
