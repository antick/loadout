import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type Device, createDevice, pushByHand, rawGit, useTwoDevices } from "./backup-world";
import { writeFile } from "./helpers";

/** Merges between two devices, and with a remote that Loadout did not write. */
describe("backup sync between two devices", () => {
  const world = useTwoDevices(["alpha", "beta"]);
  let a: Device;
  let b: Device;

  beforeEach(() => {
    ({ a, b } = world);
  });

  it("merges edits to different skills cleanly in both directions", async () => {
    a.editSkill("alpha", "from A");
    b.editSkill("beta", "from B");
    await a.api.sync();
    const outcome = await b.api.sync();

    expect(outcome.pushed).toBe(true);
    expect(outcome.merge).toMatchObject({ upToDate: false, newConflicts: [] });
    expect(outcome.merge?.updated).toEqual([{ name: "alpha", fromDevice: "Device A" }]);
    expect(b.read("alpha")).toBe("from A");
    expect(b.read("beta")).toBe("from B");
    expect(b.contentChanges.count).toBeGreaterThan(0);
    // A real merge commit with both parents.
    expect(b.git("log", "-1", "--format=%P").split(" ")).toHaveLength(2);

    const back = await a.api.sync();
    expect(back.merge?.updated).toEqual([{ name: "beta", fromDevice: "Device B" }]);
    expect(a.read("beta")).toBe("from B");
    expect(a.git("rev-parse", "HEAD")).toBe(b.git("rev-parse", "HEAD"));
  });

  it("keeps Mine and the edited files through a merge on both devices", async () => {
    const id = b.skill("alpha")?.id ?? "";

    b.store.update(id, { authored: true, editedFiles: ["SKILL.md"] });
    b.store.setTags(id, ["from-b"]);
    a.editSkill("beta", "from A");
    await a.api.sync();
    const outcome = await b.api.sync();

    // A real merge, not a fast-forward, decided skill by skill.
    expect(b.git("log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(outcome.merge?.updated).toEqual([{ name: "beta", fromDevice: "Device A" }]);
    expect(b.skill("alpha")).toMatchObject({ authored: true, editedFiles: ["SKILL.md"] });

    await a.api.sync();
    expect(a.skill("alpha")).toMatchObject({
      authored: true,
      editedFiles: ["SKILL.md"],
      tags: ["from-b"],
    });
  });

  it("combines a rename on one device with an edit on the other", async () => {
    const id = a.skill("alpha")?.id;

    a.renameSkill("alpha", "alpha-renamed");
    a.store.setTags(id ?? "", ["from-a"]);
    b.editSkill("alpha", "edited on B");
    b.store.setTags(id ?? "", ["from-b"]);
    await a.api.sync();
    const outcome = await b.api.sync();

    expect(outcome.merge?.newConflicts).toEqual([]);
    expect(existsSync(join(b.skillsDir, "alpha"))).toBe(false);
    expect(b.read("alpha-renamed")).toBe("edited on B");
    const merged = b.skill("alpha-renamed");
    expect(merged?.id).toBe(id);
    expect(merged?.tags).toEqual(["from-a", "from-b"]);

    await a.api.sync();
    expect(a.read("alpha-renamed")).toBe("edited on B");
    expect(a.skill("alpha-renamed")?.tags).toEqual(["from-a", "from-b"]);
  });

  it("keeps the edited skill when the other device deleted it", async () => {
    // A deletes alpha while B edits it; A deletes beta and B leaves it alone.
    a.deleteSkill("alpha");
    a.deleteSkill("beta");
    b.editSkill("alpha", "still needed");
    await a.api.sync();
    const outcome = await b.api.sync();

    expect(outcome.merge?.keptLocal).toEqual(["alpha"]);
    expect(outcome.merge?.newConflicts).toEqual([]);
    expect(b.read("alpha")).toBe("still needed");
    expect(existsSync(join(b.skillsDir, "beta"))).toBe(false);
    expect(b.skill("beta")).toBeNull();

    // The edit travels back to the device that deleted it.
    await a.api.sync();
    expect(a.read("alpha")).toBe("still needed");
    expect(a.skill("alpha")).not.toBeNull();
    expect(existsSync(join(a.skillsDir, "beta"))).toBe(false);
  });

  it("settles after a merge: devices do not trade commits for ever", async () => {
    const id = a.skill("alpha")?.id ?? "";

    // An update on A changes the content and the installed revision together.
    a.editSkill("alpha", "upstream v2");
    a.store.update(id, {
      sourceType: "git",
      sourceUrl: "https://example.com/r.git",
      sourceRevision: "rev2",
    });
    await a.api.sync();
    await b.api.sync();
    expect(b.skill("alpha")).toMatchObject({ sourceType: "git", sourceRevision: "rev2" });

    // B's metadata is rewritten from its database; it must match what it just merged.
    await b.flush();
    expect(await b.api.sync()).toMatchObject({ committed: false, pushed: false });
    await a.flush();
    expect(await a.api.sync()).toMatchObject({ committed: false, pushed: false, merge: null });
  });

  it("merges a remote without metadata line by line, and reports a conflict", async () => {
    pushByHand(world.dir, world.remote, basename(a.ctx.paths.metadataDir), (dir) =>
      writeFile(join(dir, "alpha", "notes.md"), "by hand"),
    );

    a.editSkill("alpha", "local work");
    await expect(a.api.sync()).rejects.toMatchObject({ code: "SYNC_CONFLICT" });
    // The failed merge was rolled back, local work is intact.
    expect(a.read("alpha")).toBe("local work");
    expect(existsSync(join(a.skillsDir, ".git", "MERGE_HEAD"))).toBe(false);
  });

  it("merges skill by skill even when an older version saved the merge switch off", async () => {
    b.ctx.settings.setRaw("skillAwareMerge", false);

    a.editSkill("alpha", "A's version");
    await a.api.sync();
    b.editSkill("alpha", "B's version");
    expect((await b.api.preview()).perSkill).toBe(true);
    const outcome = await b.api.sync();
    // A line merge would stop here; the skill-aware one keeps B's version and asks.
    expect(outcome.merge?.newConflicts).toEqual(["alpha"]);
    expect(b.read("alpha")).toBe("B's version");
  });

  it("never reads a remote without metadata as 'everything was deleted'", async () => {
    pushByHand(world.dir, world.remote, basename(a.ctx.paths.metadataDir), (dir) =>
      writeFile(join(dir, "alpha", "by-hand.md"), "added by hand"),
    );

    a.editSkill("beta", "local work");
    const outcome = await a.api.sync();

    expect(outcome.pushed).toBe(true);
    expect(a.skill("alpha")).not.toBeNull();
    expect(a.skill("beta")).not.toBeNull();
    expect(a.read("alpha", "by-hand.md")).toBe("added by hand");
    expect(a.read("beta")).toBe("local work");
  });

  it("ignores metadata from the remote that is broken or points outside the library", async () => {
    const alphaId = a.skill("alpha")?.id ?? "";
    const metadata = basename(a.ctx.paths.metadataDir);
    const manual = join(world.dir, "manual");
    rawGit(world.dir, "clone", "-q", world.remote, manual);
    rawGit(manual, "checkout", "-q", "-B", "main", "origin/main");
    writeFile(join(manual, metadata, "skills", `${alphaId}.json`), "{ not json");
    writeFile(
      join(manual, metadata, "skills", "evil.json"),
      JSON.stringify({ id: "evil", path: "../../escaped", tags: [], source: { type: "import" } }),
    );
    writeFile(join(manual, "beta", "notes.md"), "fine");
    rawGit(manual, "add", "-A");
    rawGit(
      manual,
      "-c",
      "user.name=Hand",
      "-c",
      "user.email=hand@example.com",
      "commit",
      "-qm",
      "manual",
    );
    rawGit(manual, "push", "-q", "origin", "main");

    a.addSkill("gamma");
    const outcome = await a.api.sync();

    expect(outcome.merge?.updated.map((item) => item.name)).toEqual(["beta"]);
    // The skill with the broken file is neither deleted nor replaced.
    expect(a.skill("alpha")?.id).toBe(alphaId);
    expect(existsSync(join(a.skillsDir, "alpha", "SKILL.md"))).toBe(true);
    expect(a.read("beta")).toBe("fine");
    expect(existsSync(join(a.skillsDir, "..", "escaped"))).toBe(false);
    expect(existsSync(join(a.skillsDir, "..", "..", "escaped"))).toBe(false);
  });

  it("keeps a preset whose file on the remote is broken", async () => {
    const presetId = a.addPreset("Kit", [a.skill("alpha")?.id ?? ""]);
    await a.api.sync();
    const metadata = basename(a.ctx.paths.metadataDir);
    const manual = join(world.dir, "manual");
    rawGit(world.dir, "clone", "-q", world.remote, manual);
    rawGit(manual, "checkout", "-q", "-B", "main", "origin/main");
    writeFile(join(manual, metadata, "presets", `${presetId}.json`), "{ not json");
    rawGit(manual, "add", "-A");
    rawGit(
      manual,
      "-c",
      "user.name=Hand",
      "-c",
      "user.email=hand@example.com",
      "commit",
      "-qm",
      "manual",
    );
    rawGit(manual, "push", "-q", "origin", "main");

    await a.api.sync();

    const names = a.ctx.db.all<{ name: string }>("SELECT name FROM presets").map((row) => row.name);
    expect(names).toEqual(["Kit"]);
    const file = readFileSync(join(a.ctx.paths.metadataDir, "presets", `${presetId}.json`), "utf8");
    expect(JSON.parse(file)).toMatchObject({ id: presetId, name: "Kit" });
  });

  it("reads every metadata file past one that is not valid UTF-8", async () => {
    const ids = [a.skill("alpha")?.id ?? "", a.skill("beta")?.id ?? ""].sort();
    const metadata = basename(a.ctx.paths.metadataDir);
    const manual = join(world.dir, "manual");
    rawGit(world.dir, "clone", "-q", world.remote, manual);
    rawGit(manual, "checkout", "-q", "-B", "main", "origin/main");
    // The file git reads first gets a note in Latin-1: one byte that is not UTF-8. Read as text
    // and encoded back it would be two bytes, and every file after it would be read askew.
    const file = join(manual, metadata, "skills", `${ids[0]}.json`);
    const meta = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, Buffer.from(JSON.stringify({ ...meta, note: "caf\u00e9" }), "latin1"));
    writeFile(join(manual, "beta", "notes.md"), "fine");
    rawGit(manual, "add", "-A");
    rawGit(manual, "commit", "-qm", "manual");
    rawGit(manual, "push", "-q", "origin", "main");

    const outcome = await a.api.sync();

    expect(outcome.merge?.updated.map((item) => item.name)).toContain("beta");
    expect([a.skill("alpha")?.id, a.skill("beta")?.id].sort()).toEqual(ids);
    expect(a.read("beta")).toBe("fine");
  });

  it("refuses to merge a remote with unrelated history", async () => {
    const c = createDevice(world.dir, "C");
    try {
      c.addSkill("gamma");
      await c.api.init();
      await c.api.setRemote(world.remote);
      await c.api.fetch();
      expect((await c.api.status()).upstreamHealth).toBe("unrelated_histories");
      await expect(c.api.sync()).rejects.toMatchObject({ code: "GIT_UNRELATED" });
    } finally {
      c.close();
    }
  });
});
