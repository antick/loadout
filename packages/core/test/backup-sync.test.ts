import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { SNAPSHOT_TAG_PREFIX } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INTERNAL_KEYS } from "../src/settings/store";
import {
  type Device,
  createBareRemote,
  createDevice,
  joinRemote,
  pushByHand,
  rawGit,
  seedRemote,
} from "./backup-world";
import { tempDir, writeFile } from "./helpers";

function presetNames(device: Device): string[] {
  return device.ctx.db
    .all<{ name: string }>("SELECT name FROM presets ORDER BY name")
    .map((row) => row.name);
}

describe("backup sync", () => {
  let temp: ReturnType<typeof tempDir>;
  const devices: Device[] = [];
  const track = <T extends Device>(device: T): T => {
    devices.push(device);
    return device;
  };

  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => {
    for (const device of devices.splice(0)) device.close();
    temp.cleanup();
  });

  it("signs commits with the device name even when the shell sets a git identity", async () => {
    const saved = { name: process.env.GIT_AUTHOR_NAME, committer: process.env.GIT_COMMITTER_NAME };
    process.env.GIT_AUTHOR_NAME = "Someone Else";
    process.env.GIT_COMMITTER_NAME = "Someone Else";
    try {
      const remote = createBareRemote(temp.dir);
      const a = track(createDevice(temp.dir, "A"));
      a.addSkill("alpha");
      await a.api.init();
      await a.api.setRemote(remote);
      await a.api.sync();
      expect(a.git("log", "-1", "--format=%an|%cn")).toBe("Device A|Device A");
    } finally {
      if (saved.name === undefined) delete process.env.GIT_AUTHOR_NAME;
      else process.env.GIT_AUTHOR_NAME = saved.name;
      if (saved.committer === undefined) delete process.env.GIT_COMMITTER_NAME;
      else process.env.GIT_COMMITTER_NAME = saved.committer;
    }
  });

  it("keeps a folder of subagents, commands or rules from an older version as an ordinary entry", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    writeFile(join(a.skillsDir, ".loadout-items", "commands", "commit.md"), "Commit it\n");
    expect(await a.api.sync()).toMatchObject({ pushed: true });

    const b = track(await joinRemote(temp.dir, remote));
    expect(b.read(".loadout-items", "commands/commit.md")).toBe("Commit it\n");
    writeFile(join(b.skillsDir, ".loadout-items", "commands", "commit.md"), "Commit it now\n");
    await b.api.sync();
    await a.api.sync();
    expect(a.read(".loadout-items", "commands/commit.md")).toBe("Commit it now\n");
  });

  it("reports an uninitialised library and refuses to sync it", async () => {
    const a = track(createDevice(temp.dir, "A"));
    const status = await a.api.status();
    expect(status).toMatchObject({
      isRepo: false,
      gitAvailable: true,
      upstreamHealth: "no_remote",
    });
    await expect(a.api.sync()).rejects.toMatchObject({ code: "GIT_NOT_REPO" });
  });

  it("init + sync pushes the branch and a snapshot tag", async () => {
    const remote = createBareRemote(temp.dir);
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("alpha", { tags: ["writing"] });
    await a.api.init();
    await expect(a.api.init()).rejects.toMatchObject({ code: "ALREADY_EXISTS" });

    expect(await a.api.status()).toMatchObject({
      isRepo: true,
      branch: "main",
      hasChanges: false,
      upstreamHealth: "no_remote",
    });

    // Without a remote a sync is a local commit, which is a restore point of its own.
    a.addSkill("beta");
    const changed = await a.api.status();
    expect(changed.hasChanges).toBe(true);
    expect(changed.changedSkillCount).toBe(1);
    const local = await a.api.sync();
    expect(local).toMatchObject({ committed: true, pushed: false, merge: null });
    expect(local.snapshot).toMatch(/^[0-9a-f]{12,}$/);
    expect(a.git("rev-parse", "HEAD").startsWith(local.snapshot ?? "-")).toBe(true);

    await a.api.setRemote(remote);
    expect((await a.api.status()).upstreamHealth).toBe("no_upstream");
    const outcome = await a.api.sync();
    expect(outcome.pushed).toBe(true);

    expect(rawGit(remote, "rev-parse", "refs/heads/main")).toBe(a.git("rev-parse", "HEAD"));
    // Restore points are commits: nothing else is pushed.
    expect(rawGit(remote, "tag", "--list")).toBe("");
    const status = await a.api.status();
    expect(status).toMatchObject({ ahead: 0, behind: 0, upstreamHealth: "healthy" });
    expect(status.currentSnapshot).toBe(local.snapshot);
    expect(outcome.snapshot).toBe(local.snapshot);
    expect(status.lastCommit).toBe("backup: sync skills library");

    // Commits carry the device name; the history lists them newest first.
    expect(a.git("log", "-1", "--format=%an")).toBe("Device A");
    const snapshots = await a.api.snapshots();
    expect(snapshots[0]).toMatchObject({ tag: local.snapshot, device: "Device A" });
    expect(snapshots.map((snapshot) => snapshot.message)).toEqual(
      a.git("log", "--first-parent", "--format=%s").split("\n"),
    );
    expect(await a.api.snapshots(1)).toHaveLength(1);

    // Nothing to do the second time. A tag an older version made stays where it is.
    const oldTag = `${SNAPSHOT_TAG_PREFIX}20260901-000000-abcd`;
    a.git("tag", oldTag);
    a.git("push", "-q", "origin", oldTag);
    expect(await a.api.sync()).toMatchObject({ committed: false, pushed: false, snapshot: null });
    expect(rawGit(remote, "tag", "--list")).toBe(oldTag);
    expect(a.git("tag", "--list")).toBe(oldTag);
  });

  it("merges edits to different skills cleanly in both directions", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));

    a.editSkill("alpha", "from A");
    b.editSkill("beta", "from B");
    await a.api.sync();
    const outcome = await b.api.sync();

    expect(outcome.pushed).toBe(true);
    expect(outcome.merge).toMatchObject({ upToDate: false, newConflicts: [], pendingTotal: 0 });
    expect(outcome.merge?.updated).toEqual([{ name: "alpha", fromDevice: "Device A" }]);
    expect(b.read("alpha")).toBe("from A");
    expect(b.read("beta")).toBe("from B");
    expect(b.contentChanges.count).toBeGreaterThan(0);
    // A real merge commit with both parents.
    expect(b.git("log", "-1", "--format=%P").split(" ")).toHaveLength(2);

    const back = await a.api.sync();
    expect(back.merge).toMatchObject({ fastForward: true });
    expect(back.merge?.updated).toEqual([{ name: "beta", fromDevice: "Device B" }]);
    expect(a.read("beta")).toBe("from B");
    expect(a.git("rev-parse", "HEAD")).toBe(b.git("rev-parse", "HEAD"));
  });

  it("keeps Mine and the edited files through a merge on both devices", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
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
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
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
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));

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

  it("retries when another device pushes between fetch and push", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const attempts: number[] = [];
    const b = track(
      await joinRemote(temp.dir, remote, "B", {
        hooks: {
          beforePush: async (attempt) => {
            attempts.push(attempt);
            if (attempt > 1) return;
            a.editSkill("alpha", "raced in");
            await a.api.sync();
          },
        },
      }),
    );

    b.editSkill("beta", "from B");
    const outcome = await b.api.sync();

    expect(attempts).toEqual([1, 2]);
    expect(outcome.pushed).toBe(true);
    expect(outcome.merge?.updated).toEqual([{ name: "alpha", fromDevice: "Device A" }]);
    expect(b.read("alpha")).toBe("raced in");
    expect(rawGit(remote, "rev-parse", "refs/heads/main")).toBe(b.git("rev-parse", "HEAD"));
  });

  it("gives up after three rejected pushes", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    let round = 0;
    const b = track(
      await joinRemote(temp.dir, remote, "B", {
        hooks: {
          beforePush: async () => {
            round += 1;
            a.editSkill("alpha", `race ${round}`);
            await a.api.sync();
          },
        },
      }),
    );
    b.editSkill("beta", "from B");
    await expect(b.api.sync()).rejects.toMatchObject({ code: "GIT_REJECTED" });
    expect(round).toBe(3);
  });

  it("restores a snapshot as a new commit after taking a safety snapshot", async () => {
    const remote = createBareRemote(temp.dir);
    const a = track(createDevice(temp.dir, "A"));
    a.addSkill("alpha");
    await a.api.init();
    await a.api.setRemote(remote);
    a.editSkill("alpha", "version one");
    const first = await a.api.sync();

    a.editSkill("alpha", "version two");
    a.addSkill("beta");
    await a.api.sync();
    a.editSkill("alpha", "not committed yet");
    const commitsBefore = Number(a.git("rev-list", "--count", "HEAD"));

    await expect(a.api.restore("v1.0")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(a.api.restore("--hard")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(a.api.restore("0123456789ab")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const safety = await a.api.restore(first.snapshot ?? "");

    expect(a.read("alpha")).toBe("version one");
    expect(existsSync(join(a.skillsDir, "beta"))).toBe(false);
    expect(a.skill("beta")).toBeNull();
    // History moved forward: the pending edit, then the restore.
    expect(Number(a.git("rev-list", "--count", "HEAD"))).toBe(commitsBefore + 2);
    expect(a.git("log", "-1", "--format=%s")).toBe(`restore: ${first.snapshot}`);
    expect(a.git("show", `${safety}:alpha/notes.md`)).toBe("not committed yet");
    expect((await a.api.status()).restoredFrom).toBe(first.snapshot);

    // Going back to the safety point brings everything back, and the next sync clears the note.
    await a.api.restore(safety);
    expect(a.read("alpha")).toBe("not committed yet");
    expect(a.skill("beta")).not.toBeNull();
    const outcome = await a.api.sync();
    expect(outcome.pushed).toBe(true);
    expect((await a.api.status()).restoredFrom).toBeNull();
    expect(a.ctx.settings.getRaw(INTERNAL_KEYS.backupRestoredFrom, null)).toBeNull();
    expect(rawGit(remote, "rev-parse", "main").startsWith(a.git("rev-parse", "HEAD"))).toBe(true);
  });

  it("settles after a merge: devices do not trade commits for ever", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
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
    b.flush();
    expect(await b.api.sync()).toMatchObject({ committed: false, pushed: false });
    a.flush();
    expect(await a.api.sync()).toMatchObject({ committed: false, pushed: false, merge: null });
  });

  it("merges presets: the newest edit wins, an untouched preset follows a delete", async () => {
    const remote = createBareRemote(temp.dir);
    const a = track(createDevice(temp.dir, "A"));
    const alpha = a.addSkill("alpha");
    const beta = a.addSkill("beta");
    const kit = a.addPreset("Kit", [alpha.id]);
    const old = a.addPreset("Old", [alpha.id]);
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();
    const b = track(await joinRemote(temp.dir, remote));

    const edit = (device: Device, name: string, at: number, skillId?: string): void => {
      device.ctx.db.run("UPDATE presets SET name = ?, updated_at = ? WHERE id = ?", name, at, kit);
      if (skillId) {
        device.ctx.db.run(
          "INSERT INTO preset_skills(preset_id, skill_id, sort_order, added_at) VALUES(?, ?, 1, ?)",
          kit,
          skillId,
          at,
        );
      }
    };
    const later = Date.now() + 60_000;
    edit(a, "Kit from A", later - 1000);
    a.ctx.db.run("DELETE FROM presets WHERE id = ?", old);
    edit(b, "Kit from B", later, beta.id);
    b.editSkill("beta", "forces a real merge");
    await a.api.sync();
    await b.api.sync();

    expect(presetNames(b)).toEqual(["Kit from B"]);
    expect(b.skill("beta")?.presetIds).toEqual([kit]);
    await a.api.sync();
    expect(presetNames(a)).toEqual(["Kit from B"]);
    expect(a.skill("beta")?.presetIds).toEqual([kit]);
  });

  it("commits locally on quit without touching the network", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const pushedHead = rawGit(remote, "rev-parse", "refs/heads/main");
    a.editSkill("alpha", "just before quitting");

    await a.service.auto.runOnQuit();

    expect(a.git("log", "-1", "--format=%s")).toBe("backup: on quit");
    expect((await a.api.status()).hasChanges).toBe(false);
    expect(rawGit(remote, "rev-parse", "refs/heads/main")).toBe(pushedHead);
    expect((await a.api.status()).ahead).toBe(1);
  });

  it("merges a remote without metadata line by line, and reports a conflict", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    pushByHand(temp.dir, remote, basename(a.ctx.paths.metadataDir), (dir) =>
      writeFile(join(dir, "alpha", "notes.md"), "by hand"),
    );

    a.editSkill("alpha", "local work");
    await expect(a.api.sync()).rejects.toMatchObject({ code: "SYNC_CONFLICT" });
    // The failed merge was rolled back, local work is intact.
    expect(a.read("alpha")).toBe("local work");
    expect(existsSync(join(a.skillsDir, ".git", "MERGE_HEAD"))).toBe(false);
  });

  it("merges skill by skill even when an older version saved the merge switch off", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const b = track(await joinRemote(temp.dir, remote));
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
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    pushByHand(temp.dir, remote, basename(a.ctx.paths.metadataDir), (dir) =>
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
    const { a, remote } = await seedRemote(temp.dir, ["alpha", "beta"]);
    track(a);
    const alphaId = a.skill("alpha")?.id ?? "";
    const metadata = basename(a.ctx.paths.metadataDir);
    const manual = join(temp.dir, "manual");
    rawGit(temp.dir, "clone", "-q", remote, manual);
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

  it("refuses to merge a remote with unrelated history", async () => {
    const { a, remote } = await seedRemote(temp.dir, ["alpha"]);
    track(a);
    const c = track(createDevice(temp.dir, "C"));
    c.addSkill("gamma");
    await c.api.init();
    await c.api.setRemote(remote);
    await c.api.fetch();
    expect((await c.api.status()).upstreamHealth).toBe("unrelated_histories");
    await expect(c.api.sync()).rejects.toMatchObject({ code: "GIT_UNRELATED" });
  });
});
