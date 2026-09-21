import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_PRIORITY_ORDER, BUILT_IN_AGENTS } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeProjectDir } from "../src/agents";
import { AppError } from "../src/errors";
import { INTERNAL_KEYS } from "../src/settings/store";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { writeFile } from "./helpers";

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("agents service", () => {
  let world: DeployWorld;
  const keys = async (): Promise<string[]> =>
    (await world.agents.api.list()).map((agent) => agent.key);
  const info = async (key: string) => {
    const found = (await world.agents.api.list()).find((agent) => agent.key === key);
    if (!found) throw new Error(`No agent ${key}`);
    return found;
  };

  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".claude", ".cline", ".warp");
  });
  afterEach(() => world.cleanup());

  it("lists every built-in with detection and shared folders", async () => {
    const list = await world.agents.api.list();
    expect(list).toHaveLength(BUILT_IN_AGENTS.length);
    expect(await info("claude_code")).toMatchObject({
      installed: true,
      enabled: true,
      isCustom: false,
      skillsDir: join(world.home, ".claude", "skills"),
      projectSkillsDir: ".claude/skills",
    });
    expect((await info("cursor")).installed).toBe(false);
    expect((await info("cline")).sharesDirWith).toEqual(["warp"]);
    expect(list[0]).not.toHaveProperty("extraScanDirs");
  });

  it("orders by the saved list and slots unplaced priority agents beside their neighbour", async () => {
    expect((await keys()).slice(0, AGENT_PRIORITY_ORDER.length)).toEqual(AGENT_PRIORITY_ORDER);

    const custom = await world.agents.api.addCustom({
      displayName: "Mine",
      skillsDir: join(world.home, "mine"),
    });
    await world.agents.api.setOrder(["goose", "zencoder", "cline", "goose", "not-an-agent"]);
    const ordered = await keys();
    // Saved keys keep their order; windsurf follows goose in the priority list, so it lands
    // right after goose even though the user never placed it.
    expect(ordered.indexOf("goose")).toBeLessThan(ordered.indexOf("zencoder"));
    expect(ordered.indexOf("zencoder")).toBeLessThan(ordered.indexOf("cline"));
    expect(ordered[ordered.indexOf("goose") + 1]).toBe("windsurf");
    expect(ordered[0]).toBe("claude_code");
    expect(ordered.at(-1)).toBe(custom.key);
    expect(new Set(ordered).size).toBe(ordered.length);
    expect(ordered).not.toContain("not-an-agent");
  });

  it("disabling an agent removes only what was deployed to it", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.apply([skill.id], ["claude_code", "cline", "warp"], "add");
    const handmade = join(world.home, ".claude", "skills", "handmade", "SKILL.md");
    writeFile(handmade, "not ours");

    await world.agents.api.setEnabled("claude_code", false);
    expect(existsSync(join(world.home, ".claude", "skills", "alpha"))).toBe(false);
    expect(readFileSync(handmade, "utf8")).toBe("not ours");
    expect((await info("claude_code")).enabled).toBe(false);

    // Warp still uses the shared folder, so switching Cline off must not take it away.
    await world.agents.api.setEnabled("cline", false);
    expect(existsSync(join(world.home, ".agents", "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(world.store.deployments().map((row) => row.agentKey)).toEqual(["warp"]);

    await world.agents.api.setEnabled("claude_code", true);
    expect((await info("claude_code")).enabled).toBe(true);
    expect(world.store.deployment(skill.id, "claude_code")).toBeNull();
    expect((await rejection(world.agents.api.setEnabled("nope", false))).code).toBe("NOT_FOUND");
  });

  it("disables and enables every agent at once", async () => {
    const skill = world.addSkill("alpha");
    const custom = await world.agents.api.addCustom({
      displayName: "Mine",
      skillsDir: join(world.home, "mine"),
    });
    await world.deploy.api.apply([skill.id], ["claude_code", custom.key], "add");

    await world.agents.api.setAllEnabled(false);
    const disabled = world.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.disabledAgents, []);
    expect(new Set(disabled)).toEqual(new Set([...BUILT_IN_AGENTS.map((a) => a.key), custom.key]));
    expect(world.store.deployments()).toEqual([]);
    expect(existsSync(join(world.home, "mine", "alpha"))).toBe(false);

    await world.agents.api.setAllEnabled(true);
    expect((await world.agents.api.list()).every((agent) => agent.enabled)).toBe(true);
    expect(world.store.deployments()).toEqual([]);
  });

  it("validates custom agents and generates unique keys", async () => {
    const { addCustom } = world.agents.api;
    const dir = join(world.home, "custom");
    expect((await rejection(addCustom({ displayName: "  ", skillsDir: dir }))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(addCustom({ displayName: "X", skillsDir: " " }))).message).toBe(
      "Skills path is required",
    );
    expect((await rejection(addCustom({ displayName: "X", skillsDir: "rel/path" }))).message).toBe(
      "Skills path must be absolute (or start with ~/)",
    );
    const absolute = { displayName: "X", skillsDir: dir, projectSkillsDir: "/abs" };
    expect((await rejection(addCustom(absolute))).message).toBe(
      "Project skills path must be relative to the project root",
    );
    const climbing = { displayName: "X", skillsDir: dir, projectSkillsDir: "a/../../b" };
    expect((await rejection(addCustom(climbing))).message).toBe(
      "Project skills path cannot contain parent directory segments",
    );
    expect(await keys()).toHaveLength(BUILT_IN_AGENTS.length);

    const first = await addCustom({
      displayName: " My Agent! ",
      skillsDir: "~/my-agent/skills",
      projectSkillsDir: ".mine/skills/",
    });
    expect(first).toMatchObject({
      key: "my_agent",
      displayName: "My Agent!",
      installed: true,
      enabled: true,
      isCustom: true,
      category: "coding",
      skillsDir: join(homedir(), "my-agent", "skills"),
      projectSkillsDir: ".mine/skills",
      hasPathOverride: false,
    });
    const second = await addCustom({ displayName: "my agent", skillsDir: dir });
    expect(second).toMatchObject({ key: "my_agent_2", projectSkillsDir: null });
    // A name that collapses onto a built-in key must not shadow the built-in.
    expect((await addCustom({ displayName: "Cursor", skillsDir: dir })).key).toBe("cursor_2");
    expect((await addCustom({ displayName: "!!!", skillsDir: dir })).key).toBe("agent");
  });

  it("removes a custom agent with its deployments and every trace in settings", async () => {
    const skill = world.addSkill("alpha");
    const custom = await world.agents.api.addCustom({
      displayName: "Mine",
      skillsDir: join(world.home, "mine"),
    });
    await world.deploy.api.deploy(skill.id, custom.key);
    const handmade = join(world.home, "mine", "handmade", "SKILL.md");
    writeFile(handmade, "not ours");
    await world.agents.api.setOrder([custom.key, "cursor"]);
    await world.agents.api.setEnabled(custom.key, false);
    await world.agents.api.setEnabled(custom.key, true);
    await world.deploy.api.deploy(skill.id, custom.key);

    expect((await rejection(world.agents.api.removeCustom("cursor"))).code).toBe("INVALID_INPUT");
    await world.agents.api.removeCustom(custom.key);
    expect(await keys()).not.toContain(custom.key);
    expect(existsSync(join(world.home, "mine", "alpha"))).toBe(false);
    expect(readFileSync(handmade, "utf8")).toBe("not ours");
    expect(world.store.deployments()).toEqual([]);
    expect(world.ctx.settings.getRaw<string[]>(INTERNAL_KEYS.agentOrder, [])).toEqual(["cursor"]);
    expect((await rejection(world.agents.api.removeCustom(custom.key))).code).toBe("NOT_FOUND");
  });

  it("moves deployments when a built-in's skills folder is overridden and reset", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.apply([alpha.id, beta.id], ["claude_code"], "add");
    const oldDir = join(world.home, ".claude", "skills");
    const newDir = join(world.home, "elsewhere", "skills");
    // Something of the user's already sits where beta would go: it must survive the move.
    writeFile(join(newDir, "beta", "mine.txt"), "precious");

    await world.agents.api.setSkillsDir("claude_code", newDir);
    expect(await info("claude_code")).toMatchObject({ skillsDir: newDir, hasPathOverride: true });
    expect(existsSync(join(oldDir, "alpha"))).toBe(false);
    expect(existsSync(join(oldDir, "beta"))).toBe(false);
    expect(lstatSync(join(newDir, "alpha")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(newDir, "beta", "mine.txt"), "utf8")).toBe("precious");
    expect(world.store.deployment(alpha.id, "claude_code")?.targetPath).toBe(join(newDir, "alpha"));
    expect(world.store.deployment(beta.id, "claude_code")).toBeNull();

    await world.agents.api.resetSkillsDir("claude_code");
    expect(await info("claude_code")).toMatchObject({ skillsDir: oldDir, hasPathOverride: false });
    expect(existsSync(join(newDir, "alpha"))).toBe(false);
    expect(lstatSync(join(oldDir, "alpha")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(newDir, "beta", "mine.txt"))).toBe(true);
  });

  it("an override makes an undetected agent installed; a custom agent's path lives on its record", async () => {
    await world.agents.api.setSkillsDir("cursor", join(world.home, "cursor-skills"));
    expect(await info("cursor")).toMatchObject({ installed: true, hasPathOverride: true });
    expect((await rejection(world.agents.api.setSkillsDir("cursor", "relative"))).code).toBe(
      "INVALID_INPUT",
    );

    const skill = world.addSkill("alpha");
    const custom = await world.agents.api.addCustom({
      displayName: "Mine",
      skillsDir: join(world.home, "mine"),
    });
    await world.deploy.api.deploy(skill.id, custom.key);
    await world.agents.api.setSkillsDir(custom.key, join(world.home, "mine-moved"));
    expect(await info(custom.key)).toMatchObject({
      skillsDir: join(world.home, "mine-moved"),
      hasPathOverride: false,
    });
    expect(world.registry.pathOverrides()).not.toHaveProperty(custom.key);
    expect(existsSync(join(world.home, "mine", "alpha"))).toBe(false);
    expect(lstatSync(join(world.home, "mine-moved", "alpha")).isSymbolicLink()).toBe(true);
    expect((await rejection(world.agents.api.resetSkillsDir(custom.key))).code).toBe(
      "INVALID_INPUT",
    );
  });

  it("stores project folder overrides without moving files", async () => {
    const { setProjectSkillsDir, resetProjectSkillsDir } = world.agents.api;
    await setProjectSkillsDir("claude_code", ".shared/skills/");
    expect(await info("claude_code")).toMatchObject({
      projectSkillsDir: ".shared/skills",
      hasProjectPathOverride: true,
    });
    await setProjectSkillsDir("claude_code", ".claude/skills");
    expect((await info("claude_code")).hasProjectPathOverride).toBe(false);
    await setProjectSkillsDir("claude_code", ".other");
    await setProjectSkillsDir("claude_code", null);
    expect((await info("claude_code")).projectSkillsDir).toBe(".claude/skills");
    await setProjectSkillsDir("opencode", ".opencode/skills");
    expect((await info("opencode")).hasProjectPathOverride).toBe(false);
    await setProjectSkillsDir("claude_code", ".other");
    await resetProjectSkillsDir("claude_code");
    expect((await info("claude_code")).hasProjectPathOverride).toBe(false);
    expect((await rejection(setProjectSkillsDir("claude_code", "../up"))).code).toBe(
      "INVALID_INPUT",
    );

    const custom = await world.agents.api.addCustom({
      displayName: "Mine",
      skillsDir: join(world.home, "mine"),
    });
    await setProjectSkillsDir(custom.key, ".mine\\skills");
    expect(await info(custom.key)).toMatchObject({
      projectSkillsDir: ".mine/skills",
      hasProjectPathOverride: false,
    });
    await setProjectSkillsDir(custom.key, "  ");
    expect((await info(custom.key)).projectSkillsDir).toBeNull();
  });

  it("normalises project folders", () => {
    expect(normalizeProjectDir(null)).toBeNull();
    expect(normalizeProjectDir(" ./a//b/ ")).toBe("a/b");
    expect(normalizeProjectDir(".")).toBeNull();
    expect(() => normalizeProjectDir("~/a")).toThrow();
    expect(() => normalizeProjectDir("C:\\a")).toThrow();
  });
});
