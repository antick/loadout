import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pruneBrokenLinks } from "../src/deploy";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { createTestWorld } from "./helpers";

const isLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

describe("pruneBrokenLinks", () => {
  let world: DeployWorld;
  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".claude");
  });
  afterEach(() => world.cleanup());

  it("removes links to skill folders deleted outside the app, and their rows", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    await world.deploy.api.deploy(beta.id, "claude_code");
    const agentDir = join(world.home, ".claude", "skills");
    rmSync(alpha.libraryPath, { recursive: true });

    const removed = pruneBrokenLinks(world.ctx, { registry: world.registry, store: world.store });

    expect(removed).toEqual([join(agentDir, "alpha")]);
    expect(isLink(join(agentDir, "alpha"))).toBe(false);
    expect(isLink(join(agentDir, "beta"))).toBe(true);
    expect(world.store.deployment(alpha.id, "claude_code")).toBeNull();
    expect(world.store.deployment(beta.id, "claude_code")).not.toBeNull();
  });

  it("never touches a broken link that leads somewhere else", () => {
    const agentDir = join(world.home, ".claude", "skills");
    mkdirSync(agentDir, { recursive: true });
    symlinkSync(join(world.root, "elsewhere", "gamma"), join(agentDir, "gamma"));

    expect(pruneBrokenLinks(world.ctx, { registry: world.registry, store: world.store })).toEqual(
      [],
    );
    expect(isLink(join(agentDir, "gamma"))).toBe(true);
  });
});

describe("abandoning a deleted library", () => {
  it("writes nothing back, even with a change still waiting to be written", async () => {
    const world = createTestWorld();
    try {
      world.ctx.touched("skills");
      rmSync(world.base, { recursive: true, force: true });
      world.abandon();
      await new Promise((resolve) => setImmediate(resolve));
      expect(existsSync(world.base)).toBe(false);
    } finally {
      world.cleanup();
    }
  });
});
