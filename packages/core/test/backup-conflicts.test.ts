import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { SNAPSHOT_TAG_PREFIX } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Device, isolateGit, joinRemote, seedRemote } from "./backup-world";
import { tempDir } from "./helpers";

describe("backup conflicts", () => {
  let temp: ReturnType<typeof tempDir>;
  let a: Device;
  let b: Device;
  let alphaId: string;

  /** Both devices edit `alpha`; A also edits `beta`. A syncs first, then B. */
  beforeEach(async () => {
    temp = tempDir();
    isolateGit(temp.dir);
    const seeded = await seedRemote(temp.dir, ["alpha", "beta"]);
    a = seeded.a;
    b = await joinRemote(temp.dir, seeded.remote);
    alphaId = a.skill("alpha")?.id ?? "";

    a.editSkill("alpha", "A's version");
    a.editSkill("beta", "beta from A");
    b.editSkill("alpha", "B's version");
    await a.api.sync();
  });
  afterEach(() => {
    a.close();
    b.close();
    temp.cleanup();
  });

  it("never blocks: keeps the local version, records the conflict, lands the rest", async () => {
    const outcome = await b.api.sync();

    expect(outcome.pushed).toBe(true);
    expect(outcome.merge).toMatchObject({ newConflicts: ["alpha"], pendingTotal: 1 });
    expect(outcome.merge?.updated).toEqual([{ name: "beta", fromDevice: "Device A" }]);
    expect(b.read("alpha")).toBe("B's version");
    expect(b.read("beta")).toBe("beta from A");

    const conflicts = await b.api.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      skillKey: alphaId,
      skillName: "alpha",
      theirsPath: "alpha",
    });
    expect(b.git("show", `${conflicts[0]?.theirsCommit}:alpha/notes.md`)).toBe("A's version");
    expect(b.skill("alpha")?.hasConflict).toBe(true);

    // Syncing again neither repeats nor loses the conflict.
    const again = await b.api.sync();
    expect(again.merge).toBeNull();
    expect(await b.api.conflicts()).toHaveLength(1);
  });

  it("moves a pending conflict forward when the other device edits the skill again", async () => {
    await b.api.sync();
    const first = (await b.api.conflicts())[0];

    await a.api.sync();
    expect(a.read("alpha")).toBe("B's version");
    a.editSkill("alpha", "A tries again");
    await a.api.sync();
    const outcome = await b.api.sync();

    // Still ours on disk, not announced twice, but now pointing at A's newer version.
    expect(b.read("alpha")).toBe("B's version");
    expect(outcome.merge?.newConflicts).toEqual([]);
    const refreshed = (await b.api.conflicts())[0];
    expect(refreshed?.theirsCommit).not.toBe(first?.theirsCommit);
    expect(refreshed?.detectedAt).toBe(first?.detectedAt);
    expect(b.git("show", `${refreshed?.theirsCommit}:alpha/notes.md`)).toBe("A tries again");
  });

  it("keep_local clears the conflict and changes nothing", async () => {
    await b.api.sync();
    const head = b.git("rev-parse", "HEAD");
    const safety = await b.api.resolveConflict(alphaId, "keep_local");

    expect(safety.startsWith(SNAPSHOT_TAG_PREFIX)).toBe(true);
    expect(b.git("rev-parse", `${safety}^{commit}`)).toBe(head);
    expect(b.git("rev-parse", "HEAD")).toBe(head);
    expect(b.read("alpha")).toBe("B's version");
    expect(await b.api.conflicts()).toEqual([]);
    expect(b.skill("alpha")?.hasConflict).toBe(false);
    await expect(b.api.resolveConflict(alphaId, "keep_local")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("use_remote replaces the skill with the other device's version, same id", async () => {
    await b.api.sync();
    b.store.setTags(alphaId, ["local-tag"]);
    const safety = await b.api.resolveConflict(alphaId, "use_remote");

    expect(b.read("alpha")).toBe("A's version");
    expect(b.skill("alpha")?.id).toBe(alphaId);
    expect(await b.api.conflicts()).toEqual([]);
    expect(b.git("log", "-1", "--format=%s")).toBe("resolve conflict: use remote");
    // The safety snapshot still has what was replaced, including the tag set just before.
    expect(b.git("show", `${safety}:alpha/notes.md`)).toBe("B's version");
    const metadata = basename(b.ctx.paths.metadataDir);
    expect(b.git("show", `${safety}:${metadata}/skills/${alphaId}.json`)).toContain("local-tag");

    // The choice reaches the other device on the next sync.
    await b.api.sync();
    await a.api.sync();
    expect(a.read("alpha")).toBe("A's version");
  });

  it("keep_both adds the other version as a new skill next to ours", async () => {
    await b.api.sync();
    await b.api.resolveConflict(alphaId, "keep_both");

    expect(b.read("alpha")).toBe("B's version");
    expect(b.read("alpha-remote")).toBe("A's version");
    const copy = b.skill("alpha-remote");
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(alphaId);
    expect(copy?.sourceType).toBe("import");
    expect(await b.api.conflicts()).toEqual([]);

    await b.api.sync();
    await a.api.sync();
    expect(a.read("alpha")).toBe("B's version");
    expect(a.read("alpha-remote")).toBe("A's version");
    expect(a.skill("alpha-remote")?.id).toBe(copy?.id);
  });

  it("gives an incoming skill another folder when ours already uses the name", async () => {
    // The same skill name installed separately on both devices: two ids, one folder name.
    a.addSkill("gamma", { body: "gamma on A" });
    b.addSkill("gamma", { body: "gamma on B" });
    await a.api.sync();
    await b.api.sync();

    expect(b.read("gamma", "SKILL.md")).toContain("gamma on B");
    expect(b.read("gamma-2", "SKILL.md")).toContain("gamma on A");
    expect(b.skill("gamma-2")?.id).toBe(a.skill("gamma")?.id);

    await a.api.sync();
    expect(existsSync(join(a.skillsDir, "gamma-2"))).toBe(true);
    expect(a.read("gamma-2", "SKILL.md")).toContain("gamma on A");
    expect(a.read("gamma", "SKILL.md")).toContain("gamma on B");
  });
});
