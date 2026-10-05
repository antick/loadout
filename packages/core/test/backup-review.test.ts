import { rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type Device, useTwoDevices } from "./backup-world";
import { gitRunner } from "./git-fixtures";
import { writeFile } from "./helpers";

/**
 * HEAD, refs and the state of skill folders. The app's own metadata files may be written: a
 * preview writes them the way every commit does, from the database.
 */
const state = (device: Device): string[] => [
  device.git("rev-parse", "HEAD"),
  device.git("status", "--porcelain", "--", ":!.loadout"),
  device.git("for-each-ref"),
];

/** Stages reported since the last call, oldest first. */
const stages = (device: Device): (string | null)[] =>
  device.events
    .splice(0)
    .filter((entry) => entry.event === "backup:progress")
    .map((entry) => (entry.payload as { stage: string | null }).stage);

/** The sync review: what a sync would do, worked out without changing anything. */
describe("backup sync review", () => {
  const world = useTwoDevices(["alpha", "beta", "gamma", "delta"]);
  let a: Device;
  let b: Device;

  beforeEach(() => {
    ({ a, b } = world);
  });

  it("lists local changes going out and changes nothing", async () => {
    b.editSkill("alpha", "edited on B");
    b.addSkill("epsilon");
    const before = state(b);

    const preview = await b.api.preview();

    expect(preview.remoteCommit).toBe(b.git("rev-parse", "origin/main"));
    expect(preview.incoming).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    expect(preview.outgoing.map((item) => [item.name, item.change]).sort()).toEqual([
      ["alpha", "changed"],
      ["epsilon", "added"],
    ]);
    expect(state(b)).toEqual(before);
  });

  it("lists every kind of change coming in, with the device that made it", async () => {
    a.editSkill("alpha", "from A");
    a.deleteSkill("beta");
    a.renameSkill("gamma", "gamma-2");
    a.addSkill("epsilon");
    await a.api.sync();
    const before = state(b);

    const preview = await b.api.preview();

    const incoming = preview.incoming.map((item) => ({
      name: item.name,
      change: item.change,
      path: item.path,
      previousPath: item.previousPath,
      fromDevice: item.fromDevice,
    }));
    expect(incoming.sort((x, y) => x.name.localeCompare(y.name))).toEqual([
      {
        name: "alpha",
        change: "changed",
        path: "alpha",
        previousPath: null,
        fromDevice: "Device A",
      },
      { name: "beta", change: "deleted", path: "beta", previousPath: null, fromDevice: "Device A" },
      {
        name: "epsilon",
        change: "added",
        path: "epsilon",
        previousPath: null,
        fromDevice: "Device A",
      },
      {
        name: "gamma",
        change: "renamed",
        path: "gamma-2",
        previousPath: "gamma",
        fromDevice: "Device A",
      },
    ]);
    expect(preview.remoteBackups).toBe(1);
    expect(preview.manyDeletes).toBe(false);
    // Git only fetched: the remote-tracking ref may move, nothing else.
    expect(state(b)[0]).toBe(before[0]);
    expect(state(b)[1]).toBe(before[1]);
    expect(b.skill("beta")).not.toBeNull();

    // The sync then does what the review said.
    const outcome = await b.api.sync(undefined, {
      remoteCommit: preview.remoteCommit ?? "",
      keep: [],
    });
    expect(outcome.merge?.removed.map((skill) => skill.name)).toEqual(["beta"]);
    expect(b.skill("gamma-2")).not.toBeNull();
  });

  it("names conflicts and flags many deletions", async () => {
    a.editSkill("alpha", "A's version");
    for (const name of ["beta", "gamma", "delta"]) a.deleteSkill(name);
    await a.api.sync();
    b.editSkill("alpha", "B's version");

    const preview = await b.api.preview();

    expect(preview.conflicts.map((item) => item.name)).toEqual(["alpha"]);
    expect(preview.manyDeletes).toBe(true);
    expect(preview.incoming.filter((item) => item.change === "deleted")).toHaveLength(3);
  });

  it("shows file changes of one skill, without files kept out of the backup", async () => {
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    b.editSkill("alpha", "B text");
    a.editSkill("alpha", "A text");
    writeFile(join(a.skillsDir, "alpha", "extra.md"), "extra");
    await a.api.sync();
    const preview = await b.api.preview();
    const alpha = b.skill("alpha")?.id ?? "";

    const diff = await b.api.previewDiff(alpha, preview.remoteCommit ?? "");

    expect(diff.name).toBe("alpha");
    expect(diff.entries.map((entry) => [entry.path, entry.status])).toEqual([
      ["extra.md", "added"],
      ["notes.md", "modified"],
    ]);
    const notes = diff.entries.find((entry) => entry.path === "notes.md");
    expect(notes).toMatchObject({ before: "B text", after: "A text" });
  });

  it("shows file changes of a conflict", async () => {
    a.editSkill("alpha", "A text");
    await a.api.sync();
    b.editSkill("alpha", "B text");
    await b.api.sync();
    const conflict = (await b.api.conflicts())[0];

    const diff = await b.api.conflictDiff(conflict?.skillKey ?? "");

    expect(diff.entries).toMatchObject([
      { path: "notes.md", status: "modified", before: "B text", after: "A text" },
    ]);
    await expect(b.api.conflictDiff("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("has nothing to review without a remote", async () => {
    const preview = await b.api.preview();
    expect(preview.incoming).toEqual([]);
    await b.api.removeRemote();
    expect(await b.api.preview()).toMatchObject({ remoteCommit: null, incoming: [], outgoing: [] });
  });

  it("tells whether the library changed since a review, quietly and without changing it", async () => {
    a.editSkill("alpha", "from A");
    await a.api.sync();
    const preview = await b.api.preview();
    expect(preview.localTree).toMatch(/^[0-9a-f]{40}$/);
    b.events.splice(0);
    const before = state(b);

    expect(await b.api.localTree()).toBe(preview.localTree);
    expect(state(b)).toEqual(before);
    expect(stages(b)).toEqual([]);

    b.editSkill("beta", "edited on B");
    const edited = await b.api.localTree();
    expect(edited).not.toBe(preview.localTree);

    // Tags live in the metadata a sync saves, so they count too.
    b.store.setTags(b.skill("gamma")?.id ?? "", ["new-tag"]);
    const tagged = await b.api.localTree();
    expect(tagged).not.toBe(edited);

    // A fresh review sees the library as it is now.
    expect((await b.api.preview()).localTree).toBe(tagged);
  });

  it("saves the same tree from the library's own index as from HEAD alone", async () => {
    b.editSkill("alpha", "edited on B");
    b.addSkill("epsilon");
    b.deleteSkill("beta");
    writeFile(join(b.skillsDir, "gamma", "node_modules", "dep.js"), "left out");
    writeFile(join(b.skillsDir, "gamma", ".env"), "KEY=left out");
    const actual = await b.api.localTree();
    // What the review used to do: HEAD's tree read into an empty index, then every file added.
    const fresh = join(b.skillsDir, "..", "fresh-index");
    const git = gitRunner({ GIT_INDEX_FILE: fresh });
    git(b.skillsDir, "read-tree", "HEAD");
    git(b.skillsDir, "add", "-A");
    expect(actual).toBe(git(b.skillsDir, "write-tree"));
    rmSync(fresh);

    // Without an index of its own, the library is read from HEAD the same way.
    rmSync(join(b.skillsDir, ".git", "index"));
    expect(await b.api.localTree()).toBe(actual);
  });

  it("has no library state to compare without a remote to review against", async () => {
    await b.api.removeRemote();
    expect((await b.api.preview()).localTree).toBeNull();
  });

  it("reports each stage of a review and a sync, and the end even after a failure", async () => {
    a.editSkill("alpha", "from A");
    await a.api.sync();
    b.editSkill("beta", "from B");
    b.events.splice(0);

    await b.api.preview();
    expect(stages(b)).toEqual(["downloading", "comparing", null]);

    await b.api.sync();
    expect(stages(b)).toEqual(["preparing", "saving", "downloading", "merging", "uploading", null]);

    await b.api.removeRemote();
    await b.api.setRemote(join(world.dir, "missing.git"));
    await expect(b.api.sync()).rejects.toBeDefined();
    expect(stages(b).at(-1)).toBeNull();
  });
});
