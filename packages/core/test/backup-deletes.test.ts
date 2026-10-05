import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Device, joinRemote, seedRemote } from "./backup-world";
import { tempDir } from "./helpers";

async function remoteHead(device: Device): Promise<string> {
  await device.api.fetch();
  return device.git("rev-parse", "origin/main");
}

/** Skills deleted on another device: kept in Recently removed here, and able to come back. */
describe("backup deletes from other devices", () => {
  let temp: ReturnType<typeof tempDir>;
  let a: Device;
  let b: Device;

  beforeEach(async () => {
    temp = tempDir();
    const seeded = await seedRemote(temp.dir, ["alpha", "beta", "gamma"]);
    a = seeded.a;
    b = await joinRemote(temp.dir, seeded.remote);
  });
  afterEach(() => {
    a.close();
    b.close();
    temp.cleanup();
  });

  it("keeps a skill another device deleted in Recently removed, with its tags", async () => {
    const beta = b.skill("beta");
    if (!beta) throw new Error("beta missing");
    b.store.setTags(beta.id, ["writing"]);
    await b.api.sync();
    await a.api.sync();

    a.deleteSkill("beta");
    await a.api.sync();
    const outcome = await b.api.sync();

    expect(outcome.merge?.removed).toEqual([{ name: "beta", fromDevice: "Device A" }]);
    expect(b.skill("beta")).toBeNull();
    expect(existsSync(join(b.skillsDir, "beta"))).toBe(false);
    const kept = b.removed.list();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      name: "beta",
      reason: "deleted_elsewhere",
      library: true,
      originalPath: join(b.skillsDir, "beta"),
    });
  });

  it("restoring it brings the skill back on every device", async () => {
    a.deleteSkill("beta");
    await a.api.sync();
    await b.api.sync();
    const entry = b.removed.list()[0];
    if (!entry) throw new Error("nothing in Recently removed");

    await b.removed.restore(entry.id);
    expect(b.skill("beta")).not.toBeNull();
    expect(b.read("beta", "SKILL.md")).toContain("beta");
    await b.api.sync();
    await a.api.sync();

    expect(a.skill("beta")).not.toBeNull();
    expect(existsSync(join(a.skillsDir, "beta", "SKILL.md"))).toBe(true);
  });

  it("does not report or keep anything when nothing was deleted", async () => {
    a.editSkill("alpha", "from A");
    await a.api.sync();
    const outcome = await b.api.sync();
    expect(outcome.merge?.removed).toEqual([]);
    expect(b.removed.list()).toEqual([]);
  });

  describe("many deletions at once", () => {
    let c: Device;
    let d: Device;
    const names = ["s1", "s2", "s3", "s4"];

    beforeEach(async () => {
      const seeded = await seedRemote(join(temp.dir, "guard"), names);
      c = seeded.a;
      d = await joinRemote(join(temp.dir, "guard"), seeded.remote, "D");
      for (const name of ["s1", "s2", "s3"]) c.deleteSkill(name);
      await c.api.sync();
    });
    afterEach(() => {
      c.close();
      d.close();
    });

    it("stops before changing anything when nobody reviewed them", async () => {
      const head = d.git("rev-parse", "HEAD");
      await expect(d.api.sync()).rejects.toMatchObject({
        code: "SYNC_MANY_DELETES",
        details: { count: 3, skills: ["s1", "s2", "s3"] },
      });
      expect(d.git("rev-parse", "HEAD")).toBe(head);
      for (const name of names) expect(d.skill(name)).not.toBeNull();
      expect(d.removed.list()).toEqual([]);
    });

    it("goes ahead with a review of this remote state", async () => {
      const outcome = await d.api.sync(undefined, {
        remoteCommit: await remoteHead(d),
        keep: [],
      });
      expect(outcome.merge?.removed.map((skill) => skill.name).sort()).toEqual(["s1", "s2", "s3"]);
      expect(d.skill("s4")).not.toBeNull();
      expect(d.removed.list()).toHaveLength(3);
    });

    it("keeps what the review kept, and puts it back on the other device", async () => {
      const keep = d.skill("s2")?.id ?? "";
      const outcome = await d.api.sync(undefined, {
        remoteCommit: await remoteHead(d),
        keep: [keep],
      });
      expect(outcome.merge?.removed.map((skill) => skill.name).sort()).toEqual(["s1", "s3"]);
      expect(outcome.merge?.keptLocal).toEqual(["s2"]);
      expect(d.skill("s2")).not.toBeNull();

      await c.api.sync();
      expect(c.skill("s2")).not.toBeNull();
      expect(c.skill("s1")).toBeNull();
    });

    it("refuses a review made against an older remote state", async () => {
      const reviewed = await remoteHead(d);
      c.editSkill("s4", "moved on");
      await c.api.sync();
      await expect(
        d.api.sync(undefined, { remoteCommit: reviewed, keep: [] }),
      ).rejects.toMatchObject({ code: "SYNC_PLAN_CHANGED" });
      for (const name of names) expect(d.skill(name)).not.toBeNull();
    });

    describe("with the skill-aware merge off", () => {
      beforeEach(() => {
        d.ctx.settings.set("skillAwareMerge", false);
      });

      it("still stops before changing anything when nobody reviewed them", async () => {
        const head = d.git("rev-parse", "HEAD");
        await expect(d.api.sync()).rejects.toMatchObject({
          code: "SYNC_MANY_DELETES",
          details: { count: 3, skills: ["s1", "s2", "s3"] },
        });
        expect(d.git("rev-parse", "HEAD")).toBe(head);
        for (const name of names) expect(d.skill(name)).not.toBeNull();
        expect(d.removed.list()).toEqual([]);
      });

      it("shows the deletions in the review", async () => {
        const preview = await d.api.preview();
        expect(preview).toMatchObject({ perSkill: false, manyDeletes: true });
        expect(preview.incoming.map((item) => [item.name, item.change]).sort()).toEqual([
          ["s1", "deleted"],
          ["s2", "deleted"],
          ["s3", "deleted"],
        ]);
      });

      it("keeps what a reviewed sync deletes in Recently removed, and reports it", async () => {
        const outcome = await d.api.sync(undefined, {
          remoteCommit: await remoteHead(d),
          keep: [],
        });
        expect(outcome.merge?.removed.map((skill) => skill.name).sort()).toEqual([
          "s1",
          "s2",
          "s3",
        ]);
        for (const name of ["s1", "s2", "s3"]) {
          expect(d.skill(name)).toBeNull();
          expect(existsSync(join(d.skillsDir, name))).toBe(false);
        }
        expect(d.skill("s4")).not.toBeNull();
        const kept = d.removed.list();
        expect(kept.map((entry) => entry.name).sort()).toEqual(["s1", "s2", "s3"]);
        expect(kept.every((entry) => entry.reason === "deleted_elsewhere" && entry.library)).toBe(
          true,
        );
      });
    });

    it("lets a few deletions through without asking", async () => {
      const seeded = await seedRemote(join(temp.dir, "few"), ["f1", "f2", "f3", "f4", "f5"]);
      const e = await joinRemote(join(temp.dir, "few"), seeded.remote, "E");
      try {
        seeded.a.deleteSkill("f1");
        seeded.a.deleteSkill("f2");
        await seeded.a.api.sync();
        const outcome = await e.api.sync();
        expect(outcome.merge?.removed).toHaveLength(2);
      } finally {
        seeded.a.close();
        e.close();
      }
    });
  });
});
