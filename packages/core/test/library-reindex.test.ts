import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { RepoLock } from "../src/lock";
import { MISSING_GRACE_MS } from "../src/skills/portable";
import { createTestCore, makeSkill, tempDir } from "./helpers";

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

/** A process that ends (the CLI, the app quitting) writes its metadata only under the lock. */
describe("writing metadata on the way out", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let id: string;
  let file: string;
  beforeEach(async () => {
    temp = tempDir();
    core = createTestCore({ homeDir: temp.dir });
    id = (await core.api.skills.create({ name: "alpha", description: "Test skill" })).id;
    await core.flush();
    file = join(core.ctx.paths.metadataDir, "skills", `${id}.json`);
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  const noted = (): boolean => readFileSync(file, "utf8").includes("Late note");
  const changeNote = (): void => {
    core.store.update(id, { note: "Late note" });
    core.ctx.touched("skills");
  };

  it("waits for another process before writing", async () => {
    const other = new RepoLock(core.ctx.paths.lockPath);
    let flushed: Promise<void> = Promise.resolve();
    await other.run("merge in another process", async () => {
      changeNote();
      flushed = core.flush();
      await sleep(150);
      expect(noted()).toBe(false);
    });
    await flushed;
    expect(noted()).toBe(true);
  });

  it("leaves the files alone when closing while another process holds the library", async () => {
    const other = new RepoLock(core.ctx.paths.lockPath);
    await other.run("merge in another process", () => {
      changeNote();
      core.close();
      expect(noted()).toBe(false);
    });
    core = createTestCore({ homeDir: temp.dir });
    expect(core.store.get(id).note).toBe("Late note");
  });
});

/**
 * A re-index reads a folder's files only when a stat walk says something changed: path, size,
 * modification time or executable bit of any file.
 */
describe("re-indexing without reading unchanged folders", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  let id: string;
  let doc: string;
  beforeEach(async () => {
    temp = tempDir();
    core = createTestCore({ homeDir: temp.dir });
    const skill = await core.api.skills.create({ name: "alpha", description: "Test skill" });
    id = skill.id;
    doc = join(skill.libraryPath, "SKILL.md");
    await core.flush();
    await core.background.libraryChangedOnDisk();
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  const hash = (): string | null => core.store.get(id).contentHash;

  it("trusts the recorded hash while the stat walk matches", async () => {
    const stamp = new Date("2026-01-01T00:00:00Z");
    utimesSync(doc, stamp, stamp);
    await core.background.libraryChangedOnDisk();
    const before = hash();
    // Same length, same time: only reading the bytes could tell.
    writeFileSync(doc, readFileSync(doc, "utf8").replace("Test skill", "Tset skill"));
    utimesSync(doc, stamp, stamp);
    await core.background.libraryChangedOnDisk();
    expect(hash()).toBe(before);
  });

  it("hashes again when a file changes, is renamed or becomes executable", async () => {
    const seen = new Set([hash()]);
    writeFileSync(join(dirname(doc), "notes.md"), "notes\n");
    await core.background.libraryChangedOnDisk();
    seen.add(hash());
    renameSync(join(dirname(doc), "notes.md"), join(dirname(doc), "other.md"));
    await core.background.libraryChangedOnDisk();
    seen.add(hash());
    chmodSync(join(dirname(doc), "other.md"), 0o755);
    await core.background.libraryChangedOnDisk();
    seen.add(hash());
    expect(seen.size).toBe(process.platform === "win32" ? 3 : 4);
  });

  it("opens for reading without writing metadata or removing links", () => {
    core.close();
    const metadata = join(core.ctx.paths.metadataDir, "skills");
    makeSkill(core.ctx.paths.skillsDir, "by-hand");
    const agentDir = join(temp.dir, ".claude", "skills");
    mkdirSync(agentDir, { recursive: true });
    const dangling = join(agentDir, "gone");
    symlinkSync(join(core.ctx.paths.skillsDir, "gone"), dangling);

    core = createTestCore({ homeDir: temp.dir, readOnly: true });
    const added = core.store.list().find((skill) => skill.name === "by-hand");
    expect(added).toBeDefined();
    expect(existsSync(join(metadata, `${added?.id}.json`))).toBe(false);
    expect(lstatSync(dangling).isSymbolicLink()).toBe(true);
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

describe("re-indexing after a preset was deleted", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("does not bring back a preset whose metadata file was not rewritten yet", async () => {
    const core = createTestCore({ homeDir: temp.dir });
    try {
      const preset = await core.api.presets.create({ name: "Gone" });
      await core.flush();
      const file = join(core.ctx.paths.metadataDir, "presets", `${preset.id}.json`);
      expect(existsSync(file)).toBe(true);

      await core.api.presets.remove(preset.id);
      // A re-index before the next metadata write (at start, or after an outside change).
      await core.background.libraryChangedOnDisk();

      expect(await core.api.presets.list()).toEqual([]);
      expect(existsSync(file)).toBe(false);
    } finally {
      core.close();
    }
  });
});
