import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Core, createCore } from "../src/core";
import { createDeployRepair } from "../src/deploy";
import { silentLogger } from "../src/log";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { tempDir } from "./helpers";

describe("repairing deployments", () => {
  let world: DeployWorld;
  const agentDir = (): string => join(world.home, ".claude", "skills");
  const repair = () =>
    createDeployRepair(world.ctx, {
      store: world.store,
      registry: world.registry,
      deploy: world.deploy,
    });
  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".claude");
  });
  afterEach(() => world.cleanup());

  it("puts back a link that was deleted and one that leads nowhere", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    const gamma = world.addSkill("gamma");
    for (const skill of [alpha, beta, gamma])
      await world.deploy.api.deploy(skill.id, "claude_code");
    rmSync(join(agentDir(), "alpha"));
    rmSync(join(agentDir(), "beta"));
    symlinkSync(join(world.root, "old-library", "beta"), join(agentDir(), "beta"));

    const report = await repair().run();

    expect(report.checked).toBe(3);
    expect(report.repaired.map((entry) => entry.skill)).toEqual(["alpha", "beta"]);
    expect(report.failed).toEqual([]);
    for (const name of ["alpha", "beta", "gamma"]) {
      expect(lstatSync(join(agentDir(), name)).isSymbolicLink()).toBe(true);
      expect(existsSync(join(agentDir(), name, "SKILL.md"))).toBe(true);
    }
  });

  it("puts back a deleted copy, even when the skill did not change", async () => {
    world.ctx.settings.set("deployMode", "copy");
    const alpha = world.addSkill("alpha");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    rmSync(join(agentDir(), "alpha"), { recursive: true });

    const report = await repair().run();

    expect(report.repaired).toHaveLength(1);
    expect(existsSync(join(agentDir(), "alpha", "SKILL.md"))).toBe(true);
    expect(world.store.deployment(alpha.id, "claude_code")?.mode).toBe("copy");
  });

  it("never replaces a folder it did not create, and says so", async () => {
    const alpha = world.addSkill("alpha");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    rmSync(join(agentDir(), "alpha"));
    mkdirSync(join(agentDir(), "alpha"));
    writeFileSync(join(agentDir(), "alpha", "SKILL.md"), "# by hand\n");

    const report = await repair().run();

    expect(report.repaired).toEqual([]);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ skill: "alpha", agentKey: "claude_code" });
    expect(lstatSync(join(agentDir(), "alpha")).isSymbolicLink()).toBe(false);
  });

  it("reports a skill whose library folder is gone instead of failing", async () => {
    const alpha = world.addSkill("alpha");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    rmSync(join(agentDir(), "alpha"));
    rmSync(alpha.libraryPath, { recursive: true });

    const report = await repair().run();
    expect(report.failed[0]?.message).toContain("missing from the library");
  });

  it("leaves agents that are switched off alone and counts them", async () => {
    const alpha = world.addSkill("alpha");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    rmSync(join(agentDir(), "alpha"));

    // Switching an agent off removes its deployments, so stand in for a registry without it.
    const report = await createDeployRepair(world.ctx, {
      store: world.store,
      registry: {
        available: () => [],
        find: world.registry.find.bind(world.registry),
      } as never,
      deploy: world.deploy,
    }).run();

    expect(report).toMatchObject({ checked: 0, skippedAgents: 1, repaired: [], failed: [] });
    expect(existsSync(join(agentDir(), "alpha"))).toBe(false);
  });

  it("forgets the report when dismissed, until the next run", async () => {
    const fixer = repair();
    expect(fixer.last()).toBeNull();
    await fixer.run();
    expect(fixer.last()).not.toBeNull();
    fixer.dismiss();
    expect(fixer.last()).toBeNull();
  });
});

describe("repair when the app starts", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    mkdirSync(join(temp.dir, ".claude"), { recursive: true });
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

  it("puts a missing link back and tells the app", async () => {
    const skill = await core.api.skills.create({ name: "alpha", description: "A skill" });
    await core.api.deploy.deploy(skill.id, "claude_code");
    const link = join(temp.dir, ".claude", "skills", "alpha");
    rmSync(link);
    expect(await core.api.system.repairReport()).toBeNull();

    core.background.start();
    await vi.waitFor(() => expect(existsSync(join(link, "SKILL.md"))).toBe(true));
    await vi.waitFor(async () =>
      expect((await core.api.system.repairReport())?.repaired).toHaveLength(1),
    );
    await core.api.system.dismissRepair();
    expect(await core.api.system.repairReport()).toBeNull();
    core.background.stop();
  });
});
