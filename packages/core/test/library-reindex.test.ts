import { mkdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { RepoLock } from "../src/lock";
import { MISSING_GRACE_MS } from "../src/skills/portable";
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

/**
 * A skill folder renamed by hand, or taken away for a moment by a checkout or a sync client, keeps
 * its row: tags, note and deployments survive. Only a folder gone for good loses its skill.
 */
describe("re-indexing skill folders that moved or went missing", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let skillId: string;
  let skillDir: string;
  let linkPath: string;

  beforeEach(async () => {
    temp = tempDir();
    mkdirSync(join(temp.dir, ".claude"), { recursive: true });
    core = createTestCore({ homeDir: temp.dir });
    const skill = await core.api.skills.create({ name: "alpha", description: "Test skill" });
    await core.api.skills.setTags(skill.id, ["kept"]);
    await core.api.skills.setNote(skill.id, "Why I keep it");
    await core.api.deploy.apply([skill.id], ["claude_code"], "add");
    // The metadata files are written on the next turn, under the lock.
    await new Promise((done) => setImmediate(done));
    await core.ctx.lock.run("wait for the metadata", () => undefined);
    skillId = skill.id;
    skillDir = skill.libraryPath;
    linkPath = join(temp.dir, ".claude", "skills", "alpha");
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  const expectKept = (): void => {
    const skill = core.store.find(skillId);
    expect(skill?.tags).toEqual(["kept"]);
    expect(skill?.note).toBe("Why I keep it");
    expect(skill?.deployments.map((d) => d.agentKey)).toEqual(["claude_code"]);
  };

  it("follows a folder renamed by hand, links included", async () => {
    const renamed = join(core.ctx.paths.skillsDir, "alpha-renamed");
    renameSync(skillDir, renamed);
    await core.background.libraryChangedOnDisk();

    expectKept();
    expect(core.store.find(skillId)?.libraryPath).toBe(renamed);
    expect(core.store.list()).toHaveLength(1);
    expect(resolve(readlinkSync(linkPath))).toBe(renamed);
  });

  it("follows a folder renamed while the app was closed", () => {
    core.close();
    const renamed = join(core.ctx.paths.skillsDir, "alpha-renamed");
    renameSync(skillDir, renamed);
    core = createTestCore({ homeDir: temp.dir });

    expectKept();
    expect(core.store.find(skillId)?.libraryPath).toBe(renamed);
    expect(core.store.list()).toHaveLength(1);
  });

  it("keeps everything when the folder comes back within the grace period", async () => {
    const aside = join(temp.dir, "alpha-aside");
    renameSync(skillDir, aside);
    await core.background.libraryChangedOnDisk();
    expectKept();
    expect(core.store.missingSince().has(skillId)).toBe(true);
    expect(readlinkSync(linkPath)).toBe(skillDir);

    renameSync(aside, skillDir);
    await core.background.libraryChangedOnDisk();
    expectKept();
    expect(core.store.missingSince().size).toBe(0);
  });

  it("removes the skill once its folder has stayed away past the grace period", async () => {
    rmSync(skillDir, { recursive: true });
    await core.background.libraryChangedOnDisk();
    expect(core.store.find(skillId)).not.toBeNull();

    core.store.setMissingSince(skillId, Date.now() - MISSING_GRACE_MS - 1);
    await core.background.libraryChangedOnDisk();
    expect(core.store.find(skillId)).toBeNull();
    expect(() => readlinkSync(linkPath)).toThrow();
  });
});

/**
 * The database owns tags, notes and the rest; a metadata file can be behind it (written later,
 * under the lock). A re-index refreshes only what comes from the folder.
 */
describe("re-indexing with metadata files behind the database", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    core = createTestCore({ homeDir: temp.dir });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("keeps tags, note and favourite the files do not have yet", async () => {
    const skill = await core.api.skills.create({ name: "alpha", description: "Test skill" });
    core.close();
    core = createTestCore({ homeDir: temp.dir });
    // Changed in the database only, as when the deferred metadata write has not run yet.
    core.store.setTags(skill.id, ["fresh"]);
    core.store.update(skill.id, { note: "Fresh note", favoritedAt: 1 });
    writeFileSync(join(skill.libraryPath, "extra.md"), "more\n");

    await core.background.libraryChangedOnDisk();

    const after = core.store.get(skill.id);
    expect(after.tags).toEqual(["fresh"]);
    expect(after.note).toBe("Fresh note");
    expect(after.favoritedAt).toBe(1);
    expect(after.contentHash).not.toBe(skill.contentHash);
  });

  it("changes tags only while it holds the library", async () => {
    const skill = await core.api.skills.create({ name: "alpha", description: "Test skill" });
    const other = new RepoLock(core.ctx.paths.lockPath);
    let tagged = false;
    let pending: Promise<void> = Promise.resolve();
    await other.run("merge in another process", async () => {
      pending = core.api.skills.setTags(skill.id, ["late"]).then(() => {
        tagged = true;
      });
      await sleep(150);
      expect(tagged).toBe(false);
      expect(core.store.get(skill.id).tags).toEqual([]);
    });
    await pending;
    expect(core.store.get(skill.id).tags).toEqual(["late"]);
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
