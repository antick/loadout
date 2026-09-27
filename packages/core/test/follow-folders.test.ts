import { existsSync, lstatSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { followMovedAgentFolders } from "../src/agents/follow-folders";
import { AgentRegistry } from "../src/agents/registry";
import { createDeployService } from "../src/deploy";
import { INTERNAL_KEYS } from "../src/settings/store";
import { type DeployWorld, createDeployWorld } from "./deploy-world";

describe("following an agent's folder when its home variable moves it", () => {
  let world: DeployWorld;
  let env: Record<string, string>;
  let work: string;

  // The registry and deploy service read the variable on every call, as the app's do.
  const follow = () => {
    const ctx = { ...world.ctx, env: () => env };
    const registry = new AgentRegistry(ctx);
    const deploy = createDeployService(ctx, { store: world.store, registry });
    return followMovedAgentFolders(ctx, { registry, store: world.store, deploy });
  };

  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".codex");
    env = {};
    work = join(world.home, ".codex-work");
  });
  afterEach(() => world.cleanup());

  async function deployToCodex(name: string): Promise<string> {
    const skill = world.addSkill(name);
    await world.deploy.api.deploy(skill.id, "codex");
    return join(world.home, ".codex", "skills", name);
  }

  it("moves Loadout's skills to the folder the variable names, once", async () => {
    const old = await deployToCodex("alpha");
    expect(lstatSync(old).isSymbolicLink()).toBe(true);
    mkdirSync(work, { recursive: true });
    env = { CODEX_HOME: work };

    const moves = await follow();
    expect(moves).toEqual([
      {
        agentKey: "codex",
        from: join(world.home, ".codex", "skills"),
        to: join(work, "skills"),
        moved: 1,
      },
    ]);
    expect(lstatSync(join(work, "skills", "alpha")).isSymbolicLink()).toBe(true);
    expect(existsSync(old)).toBe(false);
    expect(world.store.deploymentsForAgent("codex")[0]?.targetPath).toBe(
      join(work, "skills", "alpha"),
    );
    expect(await follow()).toEqual([]);

    // The variable goes away: back to the default folder.
    env = {};
    expect(await follow()).toHaveLength(1);
    expect(lstatSync(old).isSymbolicLink()).toBe(true);
  });

  it("leaves skills alone when the agent is not installed at the new folder", async () => {
    const old = await deployToCodex("alpha");
    env = { CODEX_HOME: join(world.home, "nowhere") };
    expect(await follow()).toEqual([]);
    expect(lstatSync(old).isSymbolicLink()).toBe(true);
    expect(world.store.deploymentsForAgent("codex")).toHaveLength(1);
  });

  it("leaves a folder chosen in Settings to the move made when it was chosen", async () => {
    const old = await deployToCodex("alpha");
    mkdirSync(work, { recursive: true });
    world.ctx.settings.setRaw(INTERNAL_KEYS.agentPathOverrides, {
      codex: join(world.home, ".codex", "skills"),
    });
    env = { CODEX_HOME: work };
    expect(await follow()).toEqual([]);
    expect(lstatSync(old).isSymbolicLink()).toBe(true);
  });

  it("does nothing when the new folder is the same folder under another name", async () => {
    await deployToCodex("alpha");
    // Like ~/.codex_sw, whose skills folder is a link to ~/.codex/skills.
    mkdirSync(work, { recursive: true });
    symlinkSync(join(world.home, ".codex", "skills"), join(work, "skills"));
    env = { CODEX_HOME: work };
    expect(await follow()).toEqual([]);
  });
});
