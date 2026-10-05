import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GIT_DIR } from "../src/util/fs";
import { type Device, useTwoDevices } from "./backup-world";
import { rejection, writeFile } from "./helpers";

describe("backup conflicts, several at once", () => {
  /** Both devices edit `alpha` and `beta`; A syncs first, then B, so B has two conflicts. */
  const world = useTwoDevices(["alpha", "beta"], async (a, b) => {
    a.editSkill("alpha", "alpha from A");
    a.editSkill("beta", "beta from A");
    b.editSkill("alpha", "alpha from B");
    b.editSkill("beta", "beta from B");
    await a.api.sync();
    await b.api.sync();
  });
  let a: Device;
  let b: Device;
  let alphaId: string;
  let betaId: string;

  beforeEach(() => {
    ({ a, b } = world);
    alphaId = a.skill("alpha")?.id ?? "";
    betaId = a.skill("beta")?.id ?? "";
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
    await b.api.resolveConflicts([alphaId], "keep_local");
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

describe("backup conflicts, left-out files that could be kept nowhere", () => {
  /** A's version of `alpha` has a file where B keeps one out of the backup; `beta` has none. */
  const world = useTwoDevices(["alpha", "beta"], async (a, b) => {
    a.editSkill("alpha", "alpha from A");
    writeFile(join(a.skillsDir, "alpha", "extra.md"), "extra from A");
    a.editSkill("beta", "beta from A");
    b.editSkill("alpha", "alpha from B");
    b.editSkill("beta", "beta from B");
    await a.api.sync();
    await b.api.sync();
  });

  it("keeps only the scratch folder of the skill whose files could not be kept", async () => {
    const { a, b } = world;
    // On this device alone, `extra.md` stays out of the backup.
    writeFile(join(b.skillsDir, GIT_DIR, "info", "exclude"), "extra.md\n");
    writeFile(join(b.skillsDir, "alpha", "extra.md"), "alpha extra from B");
    writeFile(join(b.skillsDir, "beta", "extra.md"), "beta extra from B");
    vi.spyOn(b.removed, "setAside").mockImplementation(() => {
      throw new Error("disk full");
    });
    const ids = [a.skill("alpha")?.id ?? "", a.skill("beta")?.id ?? ""];

    const error = await rejection(b.api.resolveConflicts(ids, "use_remote"));

    expect(error.code).toBe("IO");
    expect(await b.api.conflicts()).toEqual([]);
    expect(b.read("alpha")).toBe("alpha from A");
    expect(b.read("alpha", "extra.md")).toBe("extra from A");
    // Nothing stood in the way of beta's file: it moved into the new folder.
    expect(b.read("beta", "extra.md")).toBe("beta extra from B");
    // Alpha's file waits where the error says; beta's scratch folder is gone.
    const left = String(error.details?.path);
    expect(readFileSync(join(left, "extra.md"), "utf8")).toBe("alpha extra from B");
    const stages = readdirSync(dirname(b.skillsDir)).filter((name) =>
      name.startsWith(".backup-stage-"),
    );
    expect(stages).toHaveLength(1);
    expect(left.startsWith(join(dirname(b.skillsDir), stages[0] ?? ""))).toBe(true);
  });
});
