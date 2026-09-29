import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { writeFile } from "./helpers";

let world: DeployWorld;
const claudeTarget = (dirName: string): string => join(world.home, ".claude", "skills", dirName);

beforeEach(() => {
  world = createDeployWorld();
  world.installAgents(".claude", ".cline");
});
afterEach(() => world.cleanup());

describe("adding with skipConflicts", () => {
  it("leaves a refused folder alone, lists it, and deploys the rest", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    writeFile(join(claudeTarget("beta"), "mine.txt"), "precious");
    const pairs = [alpha.id, beta.id];

    const preview = await world.deploy.api.apply(pairs, ["claude_code"], "add", {
      dryRun: true,
      skipConflicts: true,
    });
    expect(preview).toMatchObject({ added: 1, conflicts: [{ path: claudeTarget("beta") }] });
    expect(world.store.deployments()).toEqual([]);

    const result = await world.deploy.api.apply(pairs, ["claude_code"], "add", {
      skipConflicts: true,
    });
    expect(result).toMatchObject({
      added: 1,
      failed: [],
      conflicts: [{ path: claudeTarget("beta") }],
    });
    expect(existsSync(claudeTarget("alpha"))).toBe(true);
    expect(readFileSync(join(claudeTarget("beta"), "mine.txt"), "utf8")).toBe("precious");
    expect(world.store.deployment(beta.id, "claude_code")).toBeNull();
  });

  it("still writes nothing when not asked to skip", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    writeFile(join(claudeTarget("beta"), "mine.txt"), "precious");
    const result = await world.deploy.api.apply([alpha.id, beta.id], ["claude_code"], "add");
    expect(result.added).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
  });

  it("deploys everything when nothing is in the way, leaving blocked pairs out", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.setBlocked(beta.id, ["cline"], true);
    const result = await world.deploy.api.apply(
      [alpha.id, beta.id],
      ["claude_code", "cline"],
      "add",
      { skipConflicts: true },
    );
    expect(result).toMatchObject({ added: 3, blocked: 1, conflicts: [], failed: [] });
  });
});
