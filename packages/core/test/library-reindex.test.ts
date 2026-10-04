import { mkdirSync, renameSync, writeFileSync } from "node:fs";
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

describe("metadata files the app did not write", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("skips a file with an odd shape instead of failing to open the library", async () => {
    let core = createTestCore({ homeDir: temp.dir });
    const kept = await core.api.skills.create({ name: "kept", description: "Test skill" });
    const odd = await core.api.skills.create({ name: "odd", description: "Test skill" });
    const skillsMeta = join(core.ctx.paths.metadataDir, "skills");
    const presetsMeta = join(core.ctx.paths.metadataDir, "presets");
    core.close();

    // Hand edits and half-merged files: valid JSON, wrong shape.
    writeFileSync(join(skillsMeta, `${odd.id}.json`), JSON.stringify({ id: odd.id, path: "odd" }));
    writeFileSync(
      join(skillsMeta, "tags.json"),
      JSON.stringify({ id: "x", path: "kept", source: { type: "git" }, tags: "a,b" }),
    );
    writeFileSync(join(skillsMeta, "array.json"), "[1, 2]");
    mkdirSync(presetsMeta, { recursive: true });
    writeFileSync(join(presetsMeta, "nameless.json"), JSON.stringify({ id: "p", skills: 3 }));

    core = createTestCore({ homeDir: temp.dir });
    try {
      const names = (await core.api.skills.list()).map((skill) => skill.name).sort();
      expect(names).toEqual(["kept", "odd"]);
      expect((await core.api.skills.get(kept.id)).tags).toEqual([]);
      expect(await core.api.presets.list()).toEqual([]);
    } finally {
      core.close();
    }
  });
});
