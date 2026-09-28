import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Device, isolateGit, joinRemote, seedRemote } from "./backup-world";
import { tempDir } from "./helpers";

/** Skills deleted on another device: kept in Recently removed here, and able to come back. */
describe("backup deletes from other devices", () => {
  let temp: ReturnType<typeof tempDir>;
  let a: Device;
  let b: Device;

  beforeEach(async () => {
    temp = tempDir();
    isolateGit(temp.dir);
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
});
