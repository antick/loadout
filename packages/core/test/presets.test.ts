import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSkill } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld, rejection } from "./workspace-world";

describe("presets", () => {
  let world: WorkspaceWorld;
  const api = () => world.presets.api;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor");
  });
  afterEach(() => world.cleanup());

  it("creates with trimmed fields, empty text as null, and new presets last", async () => {
    const first = await api().create({ name: "  Writing  ", description: "  ", icon: " pen " });
    expect(first).toMatchObject({ name: "Writing", description: null, icon: "pen", skillIds: [] });
    const second = await api().create({ name: "Coding", description: " for work " });
    expect(second.description).toBe("for work");
    expect((await api().list()).map((p) => p.name)).toEqual(["Writing", "Coding"]);

    await api().reorder([second.id, first.id]);
    const third = await api().create({ name: "Later" });
    expect((await api().list()).map((p) => p.name)).toEqual(["Coding", "Writing", "Later"]);
    expect(third.sortOrder).toBeGreaterThan(1);
  });

  it("refuses empty and duplicate names, on create and on update", async () => {
    const empty = await rejection(api().create({ name: "   " }));
    expect(empty.code).toBe("INVALID_INPUT");
    expect(empty.message).toBe("Preset name cannot be empty");

    const a = await api().create({ name: "A" });
    const b = await api().create({ name: "B" });
    expect((await rejection(api().create({ name: " A " }))).code).toBe("ALREADY_EXISTS");
    expect((await rejection(api().update(b.id, { name: "A" }))).code).toBe("ALREADY_EXISTS");

    // Keeping its own name is not a clash.
    const renamed = await api().update(a.id, { name: "A", description: "now described" });
    expect(renamed.description).toBe("now described");
    expect((await rejection(api().update("missing", { name: "X" }))).code).toBe("NOT_FOUND");
  });

  it("adds, removes and reorders skills without touching any agent folder", async () => {
    const one = world.addSkill("one");
    const two = world.addSkill("two");
    const three = world.addSkill("three");
    const preset = await api().create({ name: "Set" });

    await api().addSkills(preset.id, [one.id, two.id]);
    await api().addSkills(preset.id, [two.id, three.id]);
    expect((await api().list())[0]?.skillIds).toEqual([one.id, two.id, three.id]);

    await api().reorderSkills(preset.id, [three.id, one.id, two.id]);
    expect((await api().list())[0]?.skillIds).toEqual([three.id, one.id, two.id]);

    await api().removeSkills(preset.id, [one.id, "not-a-member"]);
    expect((await api().list())[0]?.skillIds).toEqual([three.id, two.id]);
    expect(world.store.get(two.id).presetIds).toEqual([preset.id]);

    expect(existsSync(join(world.home, ".claude", "skills"))).toBe(false);
    expect(world.store.deployments()).toEqual([]);
  });

  it("adds nothing when one of the skills does not exist", async () => {
    const one = world.addSkill("one");
    const preset = await api().create({ name: "Set" });
    expect((await rejection(api().addSkills(preset.id, [one.id, "ghost"]))).code).toBe("NOT_FOUND");
    expect((await api().list())[0]?.skillIds).toEqual([]);
  });

  it("lists every agent's switch: on by default, off when the agent cannot be used", async () => {
    const skill = world.addSkill("one");
    const outsider = world.addSkill("outsider");
    const preset = await api().create({ name: "Set" });
    await api().addSkills(preset.id, [skill.id]);
    await world.agents.api.setEnabled("cursor", false);

    const toggles = await api().toggles(preset.id, skill.id);
    expect(toggles.length).toBe(world.registry.list().length);
    const byKey = new Map(toggles.map((t) => [t.agentKey, t]));
    expect(byKey.get("claude_code")).toMatchObject({
      installed: true,
      globallyEnabled: true,
      enabled: true,
    });
    expect(byKey.get("cursor")).toMatchObject({
      installed: true,
      globallyEnabled: false,
      enabled: false,
    });
    expect(byKey.get("codex")).toMatchObject({ installed: false, enabled: false });

    const error = await rejection(api().toggles(preset.id, outsider.id));
    expect(error.message).toBe("Skill is not in this preset");
  });

  it("only lets a switch be turned on for an installed, enabled agent, and never deploys", async () => {
    const skill = world.addSkill("one");
    const preset = await api().create({ name: "Set" });
    await api().addSkills(preset.id, [skill.id]);
    await world.agents.api.setEnabled("cursor", false);

    expect((await rejection(api().setToggle(preset.id, skill.id, "codex", true))).message).toBe(
      "Codex is not installed",
    );
    expect((await rejection(api().setToggle(preset.id, skill.id, "cursor", true))).message).toBe(
      "Cursor is disabled",
    );
    // Turning off is always allowed.
    await api().setToggle(preset.id, skill.id, "codex", false);

    await api().setToggle(preset.id, skill.id, "claude_code", false);
    const off = (await api().toggles(preset.id, skill.id)).find(
      (t) => t.agentKey === "claude_code",
    );
    expect(off?.enabled).toBe(false);
    await api().setToggle(preset.id, skill.id, "claude_code", true);
    const on = (await api().toggles(preset.id, skill.id)).find((t) => t.agentKey === "claude_code");
    expect(on?.enabled).toBe(true);
    expect(world.store.deployments()).toEqual([]);
  });

  it("applies skills × available agents, honouring each skill's own switches", async () => {
    const one = world.addSkill("one");
    const two = world.addSkill("two");
    const preset = await api().create({ name: "Set" });
    await api().addSkills(preset.id, [one.id, two.id]);
    await api().setToggle(preset.id, one.id, "cursor", false);

    const result = await api().applyToDefault(preset.id);
    expect(result).toMatchObject({ added: 3, removed: 0, conflicts: [], failed: [] });
    const claude = join(world.home, ".claude", "skills");
    const cursor = join(world.home, ".cursor", "skills");
    expect(lstatSync(join(claude, "one")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(claude, "two")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(cursor, "one"))).toBe(false);
    expect(existsSync(join(cursor, "two"))).toBe(true);

    // Applying again changes nothing, and membership edits never undeploy.
    expect(await api().applyToDefault(preset.id)).toMatchObject({ added: 0, skipped: 3 });
    await api().removeSkills(preset.id, [two.id]);
    expect(existsSync(join(cursor, "two"))).toBe(true);

    const entry = world.ctx.activity.list(20).find((a) => a.kind === "preset");
    expect(entry).toMatchObject({ subject: "Set", ok: true });
  });

  it("reports deploy progress and removes a preset from every enabled agent", async () => {
    const one = world.addSkill("one");
    const two = world.addSkill("two");
    const preset = await api().create({ name: "Set" });
    const empty = await api().create({ name: "Empty" });
    await api().addSkills(preset.id, [one.id, two.id]);
    await api().setToggle(preset.id, one.id, "cursor", false);
    const status = async () => (await api().deployStatus()).map((s) => [s.deployed, s.total]);

    // Pairs switched off do not count towards the total.
    expect(await status()).toEqual([
      [0, 3],
      [0, 0],
    ]);
    expect((await api().deployStatus())[1]?.presetId).toBe(empty.id);
    await world.deploy.api.deploy(two.id, "claude_code");
    expect(await status()).toEqual([
      [1, 3],
      [0, 0],
    ]);
    await api().applyToDefault(preset.id);
    expect((await status())[0]).toEqual([3, 3]);

    const result = await api().removeFromDefault(preset.id);
    expect(result).toMatchObject({ removed: 3, conflicts: [], failed: [] });
    expect(world.store.deployments()).toEqual([]);
    expect(existsSync(join(world.home, ".claude", "skills", "one"))).toBe(false);
    expect((await status())[0]).toEqual([0, 3]);
    const entry = world.ctx.activity.list(20).find((a) => a.kind === "preset");
    expect(entry).toMatchObject({ subject: "Set", ok: true });
    expect(entry?.detail).toMatch(/3 removed/);
  });

  it("reports a refused target and records the apply as not clean", async () => {
    const one = world.addSkill("one");
    const preset = await api().create({ name: "Set" });
    await api().addSkills(preset.id, [one.id]);
    makeSkill(join(world.home, ".claude", "skills"), "one", { body: "someone else's" });

    const result = await api().applyToDefault(preset.id);
    expect(result.added).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(world.ctx.activity.list(20).find((a) => a.kind === "preset")?.ok).toBe(false);
  });

  it("removes a preset with its memberships and keeps the skills", async () => {
    const one = world.addSkill("one");
    const preset = await api().create({ name: "Set" });
    await api().addSkills(preset.id, [one.id]);
    await api().remove(preset.id);
    expect(await api().list()).toEqual([]);
    expect(world.store.get(one.id).presetIds).toEqual([]);
    expect((await rejection(api().remove(preset.id))).code).toBe("NOT_FOUND");
  });
});
