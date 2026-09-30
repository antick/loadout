import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_NOTE_MAX_LENGTH, matchesSkillQuery } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SkillSide, planSkill } from "../src/backup/merge-plan";
import { type Core, createCore } from "../src/core";
import { silentLogger } from "../src/log";
import { makeSkill, tempDir } from "./helpers";

/** One side of a merge: the same skill, with this note. */
function side(note?: string): SkillSide {
  return {
    path: "rust",
    treeHash: "t",
    meta: { id: "s", path: "rust", tags: [], source: { type: "local" }, createdAt: 0, note },
  };
}

describe("a note on a skill", () => {
  let temp: { dir: string; cleanup: () => void };
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    core = createCore({
      homeDir: temp.dir,
      configDir: join(temp.dir, "config"),
      logger: silentLogger,
      safetyScannerPath: null,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("is saved trimmed and capped, without touching the skill's change time", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    const saved = await core.api.skills.setNote(skill.id, "  Run before a release.  ");
    expect(saved.note).toBe("Run before a release.");
    expect(saved.updatedAt).toBe(skill.updatedAt);
    const long = await core.api.skills.setNote(skill.id, "x".repeat(SKILL_NOTE_MAX_LENGTH + 50));
    expect(long.note).toHaveLength(SKILL_NOTE_MAX_LENGTH);
    expect((await core.api.skills.setNote(skill.id, "   ")).note).toBeNull();
    expect((await core.api.skills.setNote(skill.id, null)).note).toBeNull();
  });

  it("travels with the portable metadata", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    await core.api.skills.setNote(skill.id, "Run before a release.");
    core.ctx.touched("skills");
    await new Promise((resolve) => setImmediate(resolve));
    const metaFile = join(core.ctx.paths.skillsDir, ".loadout", "skills", `${skill.id}.json`);
    const file = JSON.parse(readFileSync(metaFile, "utf8")) as { note?: string };
    expect(file.note).toBe("Run before a release.");

    core.store.update(skill.id, { note: null });
    await core.api.skills.setNote(skill.id, null);
    core.ctx.touched("skills");
    await new Promise((resolve) => setImmediate(resolve));
    expect(JSON.parse(readFileSync(metaFile, "utf8"))).not.toHaveProperty("note");
  });

  it("is found by the library search", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    const noted = await core.api.skills.setNote(skill.id, "Run before every release");
    expect(matchesSkillQuery(noted, "every release")).toBe(true);
    expect(matchesSkillQuery(noted, "release rust")).toBe(true);
    expect(matchesSkillQuery(skill, "every release")).toBe(false);
  });

  it("comes back with a skill restored from Recently removed", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    await core.api.skills.setNote(skill.id, "Keep this one.");
    const result = await core.api.skills.removeMany([skill.id]);
    await core.api.storage.restoreRemoved(result.removedIds[0] ?? "");
    expect(core.store.findByLibraryPath(skill.libraryPath)?.note).toBe("Keep this one.");
  });

  it("follows the side that changed it in a backup merge, ours when both did", () => {
    const theirs = planSkill("s", { base: side(), ours: side(), theirs: side("From the laptop") });
    expect(theirs.meta?.note).toBe("From the laptop");
    expect(theirs.outcome).toBe("updated");
    const ours = planSkill("s", { base: side("old"), ours: side("mine"), theirs: side("theirs") });
    expect(ours.meta?.note).toBe("mine");
    const cleared = planSkill("s", { base: side("old"), ours: side("old"), theirs: side() });
    expect(cleared.meta).not.toHaveProperty("note");
    expect(cleared.outcome).toBe("updated");
    const same = planSkill("s", { base: side("old"), ours: side("old"), theirs: side("old") });
    expect(same.outcome).toBe("unchanged");
  });
});
