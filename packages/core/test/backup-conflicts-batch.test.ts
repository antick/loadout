import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Device, joinRemote, seedRemote } from "./backup-world";
import { tempDir } from "./helpers";

describe("backup conflicts, several at once", () => {
  let temp: ReturnType<typeof tempDir>;
  let a: Device;
  let b: Device;
  let alphaId: string;
  let betaId: string;

  /** Both devices edit `alpha` and `beta`; A syncs first, then B, so B has two conflicts. */
  beforeEach(async () => {
    temp = tempDir();
    const seeded = await seedRemote(temp.dir, ["alpha", "beta"]);
    a = seeded.a;
    b = await joinRemote(temp.dir, seeded.remote);
    alphaId = a.skill("alpha")?.id ?? "";
    betaId = a.skill("beta")?.id ?? "";

    a.editSkill("alpha", "alpha from A");
    a.editSkill("beta", "beta from A");
    b.editSkill("alpha", "alpha from B");
    b.editSkill("beta", "beta from B");
    await a.api.sync();
    await b.api.sync();
  });
  afterEach(() => {
    a.close();
    b.close();
    temp.cleanup();
  });

  it("applies one choice to all of them behind one safety snapshot and one commit", async () => {
    expect(await b.api.conflicts()).toHaveLength(2);
    const head = b.git("rev-parse", "HEAD");
    const safety = await b.api.resolveConflicts([alphaId, betaId], "use_remote");

    expect(safety).toMatch(/^[0-9a-f]{12,}$/);
    expect(b.git("rev-parse", `${safety}^{commit}`)).toBe(head);
    expect(b.git("rev-list", "--count", `${head}..HEAD`)).toBe("1");
    expect(b.git("log", "-1", "--format=%s")).toBe("resolve conflict: use remote (2 skills)");
    expect(b.read("alpha")).toBe("alpha from A");
    expect(b.read("beta")).toBe("beta from A");
    expect(await b.api.conflicts()).toEqual([]);
  });

  it("keep_both adds a copy for each", async () => {
    await b.api.resolveConflicts([alphaId, betaId], "keep_both");

    expect(b.read("alpha")).toBe("alpha from B");
    expect(b.read("alpha-remote")).toBe("alpha from A");
    expect(b.read("beta")).toBe("beta from B");
    expect(b.read("beta-remote")).toBe("beta from A");
    expect(await b.api.conflicts()).toEqual([]);
  });

  it("puts every skill back when one of them fails", async () => {
    // The other device's version of beta can no longer be found.
    b.ctx.db.run("UPDATE backup_conflicts SET theirs_path = NULL WHERE skill_key = ?", betaId);
    await expect(b.api.resolveConflicts([alphaId, betaId], "use_remote")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    // alpha was replaced first; it is back to this computer's version.
    expect(b.read("alpha")).toBe("alpha from B");
    expect(b.read("beta")).toBe("beta from B");
    expect(await b.api.conflicts()).toHaveLength(2);
    expect(b.git("status", "--porcelain")).toBe("");
  });

  it("skips conflicts resolved meanwhile, and refuses when none are left", async () => {
    await b.api.resolveConflict(alphaId, "keep_local");
    await b.api.resolveConflicts([alphaId, betaId], "keep_local");
    expect(await b.api.conflicts()).toEqual([]);

    await expect(b.api.resolveConflicts([alphaId, betaId], "keep_local")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses anything but a list of ids", async () => {
    await expect(
      b.api.resolveConflicts("alpha" as unknown as string[], "keep_local"),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await b.api.conflicts()).toHaveLength(2);
  });
});
