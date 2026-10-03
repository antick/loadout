import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SkillSide, planSkill } from "../src/backup/merge-plan";
import type { Core } from "../src/core";
import { readFavoritedAt } from "../src/skills/portable";
import { makeSkill, tempDir, createTestCore } from "./helpers";

/** One side of a merge: the same skill, a favourite since this time. */
function side(favoritedAt?: number): SkillSide {
  return {
    path: "rust",
    treeHash: "t",
    meta: { id: "s", path: "rust", tags: [], source: { type: "local" }, createdAt: 0, favoritedAt },
  };
}

describe("favourite skills", () => {
  let temp: { dir: string; cleanup: () => void };
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    core = createTestCore({
      homeDir: temp.dir,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("remembers when a skill became one, without touching its change time", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    expect(skill.favoritedAt).toBeNull();
    const before = Date.now();
    const starred = await core.api.skills.setFavorite(skill.id, true);
    expect(starred.favoritedAt).toBeGreaterThanOrEqual(before);
    expect(starred.updatedAt).toBe(skill.updatedAt);
    // Asking again keeps the time it became one.
    expect((await core.api.skills.setFavorite(skill.id, true)).favoritedAt).toBe(
      starred.favoritedAt,
    );
    expect((await core.api.skills.setFavorite(skill.id, false)).favoritedAt).toBeNull();
  });

  it("travels with the portable metadata, dropping anything odd from another device", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    const starred = await core.api.skills.setFavorite(skill.id, true);
    core.ctx.touched("skills");
    await new Promise((resolve) => setImmediate(resolve));
    const metaFile = join(core.ctx.paths.skillsDir, ".loadout", "skills", `${skill.id}.json`);
    const file = JSON.parse(readFileSync(metaFile, "utf8")) as { favoritedAt?: number };
    expect(file.favoritedAt).toBe(starred.favoritedAt);
    expect(readFavoritedAt("soon")).toBeNull();
    expect(readFavoritedAt(-1)).toBeNull();
    expect(readFavoritedAt(1.5)).toBeNull();
    expect(readFavoritedAt(42)).toBe(42);
  });

  it("comes back with a skill restored from Recently removed", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    const starred = await core.api.skills.setFavorite(skill.id, true);
    const result = await core.api.skills.removeMany([skill.id]);
    await core.api.storage.restoreRemoved(result.removedIds[0] ?? "");
    expect(core.store.findByLibraryPath(skill.libraryPath)?.favoritedAt).toBe(starred.favoritedAt);
  });

  it("follows the side that changed it in a backup merge, ours when both did", () => {
    const theirs = planSkill("s", { base: side(), ours: side(), theirs: side(5) });
    expect(theirs.meta?.favoritedAt).toBe(5);
    expect(theirs.outcome).toBe("updated");
    const ours = planSkill("s", { base: side(1), ours: side(), theirs: side(9) });
    expect(ours.meta).not.toHaveProperty("favoritedAt");
    const same = planSkill("s", { base: side(1), ours: side(1), theirs: side(1) });
    expect(same.outcome).toBe("unchanged");
  });
});
